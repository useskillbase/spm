import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SkillsConfig, SyncJson } from "../types/index.js";
import { SyncClient, getSyncClient, getSyncClientForProject } from "../core/sync-client.js";
import { getSkillIndex } from "../core/registry.js";

/**
 * Session state — tracks loaded feature versions for efficient diff checks.
 * Key: feature ID, Value: last known version.
 */
const featureVersions = new Map<string, number>();

/** Cached project knowledge_update_mode per project ID */
const projectModes = new Map<string, "auto" | "confirm">();

function text(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function error(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

/** Module-level syncJson, set by registerSyncTools from .skillbase/sync.json */
let activeSyncJson: SyncJson | null = null;

function resolveClient(config: SkillsConfig): {
  client: SyncClient;
  projectId: string | undefined;
} | null {
  // Prefer .skillbase/sync.json binding (picks correct company connection)
  if (activeSyncJson) {
    const resolved = getSyncClientForProject(config, activeSyncJson);
    if (resolved) {
      return {
        client: resolved.client,
        projectId: resolved.projectId,
      };
    }
  }

  // Fallback to active connection
  const resolved = getSyncClient(config);
  if (!resolved) return null;
  return {
    client: resolved.client,
    projectId: resolved.connection.project_id,
  };
}

export function registerSyncTools(
  server: McpServer,
  config: SkillsConfig,
  syncJson?: SyncJson | null,
): void {
  // Store syncJson for resolveClient
  activeSyncJson = syncJson ?? null;

  // Only register if there are sync connections
  const hasSyncConnections = (config.sync?.connections?.length ?? 0) > 0;
  if (!hasSyncConnections) return;

  if (config.tools.sync_status) {
    registerSyncStatus(server, config);
  }
  if (config.tools.sync_environment) {
    registerSyncEnvironment(server, config);
  }
  if (config.tools.sync_install) {
    registerSyncInstall(server, config);
  }
  if (config.tools.sync_project_prompt) {
    registerSyncProjectPrompt(server, config);
  }
  if (config.tools.sync_feature_load) {
    registerSyncFeatureLoad(server, config);
  }
  if (config.tools.sync_feature_update) {
    registerSyncFeatureUpdate(server, config);
  }
  if (config.tools.sync_feature_diff) {
    registerSyncFeatureDiff(server, config);
  }
  if (config.tools.sync_search) {
    registerSyncSearch(server, config);
  }
}

// ---------------------------------------------------------------------------
// sync_status
// ---------------------------------------------------------------------------

function registerSyncStatus(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_status",
    "Check Sync connection status. Returns connected companies, active project, and project's knowledge_update_mode. Call this if you're unsure whether Sync is set up or which project you're working in.",
    {},
    async () => {
      const sync = config.sync;
      if (!sync?.connections?.length) {
        return text({ connected: false, connections: [] });
      }

      const active = sync.active_connection ?? sync.connections[0]?.company;
      const connections = sync.connections.map((c) => ({
        company: c.company,
        api: c.api,
        project_id: c.project_id ?? null,
        active: c.company === active,
        connected_at: c.connected_at,
      }));

      // Fetch knowledge_update_mode for active project
      const resolved = resolveClient(config);
      let knowledgeUpdateMode: string | null = null;
      if (resolved?.projectId) {
        try {
          const manifest = await resolved.client.getManifest(resolved.projectId);
          knowledgeUpdateMode = manifest.project.knowledgeUpdateMode;
          projectModes.set(resolved.projectId, manifest.project.knowledgeUpdateMode);
        } catch {
          // Connection may be stale — report what we have
        }
      }

      return text({
        connected: true,
        connections,
        active_project_id: resolved?.projectId ?? null,
        knowledge_update_mode: knowledgeUpdateMode,
      });
    },
  );
}

// ---------------------------------------------------------------------------
// sync_environment
// ---------------------------------------------------------------------------

function registerSyncEnvironment(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_environment",
    "Compare the active project's required skills and personas against what's installed locally. Returns lists of missing and outdated packages. Call this when you suspect you're missing a skill for the task, or proactively at the start of a session.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project UUID. Defaults to active project from config."),
    },
    async ({ project_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const pid = project_id ?? resolved.projectId;
      if (!pid) return error("No active project. Pass project_id explicitly.");

      try {
        const manifest = await resolved.client.getManifest(pid);
        const index = await getSkillIndex();
        const installedNames = new Set(index.skills.map((s) => s.name));

        const missingSkills = manifest.skills.filter(
          (s) => !installedNames.has(s.skillName),
        );
        const missingPersonas = manifest.personas.filter(
          (p) => !installedNames.has(p.personaName),
        );

        return text({
          project: manifest.project,
          required: {
            skills: manifest.skills.length,
            personas: manifest.personas.length,
          },
          missing: {
            skills: missingSkills,
            personas: missingPersonas,
          },
          up_to_date:
            missingSkills.length === 0 && missingPersonas.length === 0,
        });
      } catch (err) {
        return error(
          `Failed to check environment: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_install
// ---------------------------------------------------------------------------

function registerSyncInstall(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_install",
    "Install missing skills and personas from the project manifest. REQUIRES user confirmation before calling. Show the user what will be installed first.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project UUID. Defaults to active project."),
    },
    async ({ project_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const pid = project_id ?? resolved.projectId;
      if (!pid) return error("No active project. Pass project_id explicitly.");

      try {
        const manifest = await resolved.client.getManifest(pid);
        const index = await getSkillIndex();
        const installedNames = new Set(index.skills.map((s) => s.name));

        const toInstall: Array<{ name: string; version: string; type: "skill" | "persona" }> = [];

        for (const s of manifest.skills) {
          if (!installedNames.has(s.skillName)) {
            toInstall.push({ name: s.skillName, version: s.skillVersion, type: "skill" });
          }
        }
        for (const p of manifest.personas) {
          if (!installedNames.has(p.personaName)) {
            toInstall.push({ name: p.personaName, version: p.personaVersion, type: "persona" });
          }
        }

        if (toInstall.length === 0) {
          return text({ message: "Everything is up to date.", installed: 0 });
        }

        // Install each missing package
        const { installSkill } = await import("../core/actions.js");
        const results: Array<{ name: string; status: string }> = [];

        for (const pkg of toInstall) {
          try {
            await installSkill(pkg.name, pkg.version === "latest" ? undefined : pkg.version);
            results.push({ name: pkg.name, status: "installed" });
          } catch (err) {
            results.push({
              name: pkg.name,
              status: `failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
        }

        return text({
          installed: results.filter((r) => r.status === "installed").length,
          failed: results.filter((r) => r.status !== "installed").length,
          details: results,
        });
      } catch (err) {
        return error(
          `Failed to sync install: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_project_prompt
// ---------------------------------------------------------------------------

function registerSyncProjectPrompt(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_project_prompt",
    "Load the project-level prompt — equivalent to CLAUDE.md. Contains project overview, tech stack, conventions, and architecture decisions that apply to all features. Load once per session, reload only if version changed.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project UUID. Defaults to active project."),
    },
    async ({ project_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const pid = project_id ?? resolved.projectId;
      if (!pid) return error("No active project. Pass project_id explicitly.");

      try {
        const prompt = await resolved.client.getProjectPrompt(pid);

        if (!prompt.promptContent) {
          return text({
            message: "No project prompt configured yet.",
            version: prompt.promptVersion,
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                version: prompt.promptVersion,
                conventions: prompt.conventions,
              }),
            },
            {
              type: "text" as const,
              text: prompt.promptContent,
            },
          ],
        };
      } catch (err) {
        return error(
          `Failed to load project prompt: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_feature_load
// ---------------------------------------------------------------------------

function registerSyncFeatureLoad(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_load",
    "Load feature context. First call returns a lightweight map (title, status, knowledge summary, version). Use the sections parameter to selectively load full knowledge items. Typical first load: sections=[\"decision\",\"constraint\",\"open_question\"]. Load \"fact\" and \"artifact\" sections on demand. If no feature_id is provided, pass a query to search by name/slug.",
    {
      feature_id: z
        .string()
        .optional()
        .describe("Feature UUID. Omit if using query to search."),
      query: z
        .string()
        .optional()
        .describe("Search by feature name or slug if feature_id is unknown."),
      sections: z
        .array(z.string())
        .optional()
        .describe(
          "Knowledge types to load in full: fact, decision, constraint, artifact, open_question. Omit for map only.",
        ),
    },
    async ({ feature_id, query, sections }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      try {
        let featureId = feature_id;

        // If no feature_id, search by query
        if (!featureId && query) {
          const pid = resolved.projectId;
          if (!pid) return error("No active project. Pass feature_id directly.");

          const results = await resolved.client.searchProject(pid, query, 5);
          if (results.features.length === 0) {
            return text({
              message: `No features found matching "${query}".`,
              suggestions: results.knowledgeItems.length > 0
                ? "Found related knowledge items — try loading their features."
                : undefined,
              knowledge_matches: results.knowledgeItems.slice(0, 3).map((ki) => ({
                feature_id: ki.feature_id,
                feature_title: ki.feature_title,
                type: ki.type,
                content: ki.content.slice(0, 100),
              })),
            });
          }

          // If exact match or single result, use it
          if (results.features.length === 1) {
            featureId = results.features[0].id;
          } else {
            // Multiple matches — return options for the user to pick
            return text({
              message: `Multiple features match "${query}". Pick one:`,
              features: results.features.map((f) => ({
                id: f.id,
                slug: f.slug,
                title: f.title,
                status: f.status,
              })),
            });
          }
        }

        if (!featureId) {
          return error("Provide feature_id or query to load a feature.");
        }

        // Load map
        const map = await resolved.client.getFeatureMap(featureId);

        // Track version for future diff
        featureVersions.set(featureId, map.feature.version);

        // Cache project mode from map if we have manifest
        // (projectPromptVersion tells us the project exists)

        // If no sections requested, return map only
        if (!sections || sections.length === 0) {
          return text(map);
        }

        // Load requested knowledge sections
        const knowledge = await resolved.client.getFeatureKnowledge(
          featureId,
          sections,
        );

        return text({
          feature: map.feature,
          knowledgeSummary: map.knowledgeSummary,
          projectPromptVersion: map.projectPromptVersion,
          knowledge: knowledge.items,
        });
      } catch (err) {
        return error(
          `Failed to load feature: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_feature_update
// ---------------------------------------------------------------------------

function registerSyncFeatureUpdate(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_update",
    'Push knowledge updates to a feature. Each call is atomic — bumps the feature version and records the change in history. Use operations array: "add" to create new knowledge items, "update" to modify existing ones (e.g., mark open_question as resolved), "remove" to delete outdated items. For decisions, ALWAYS include the reason field — this is what makes decisions valuable to the next person. If the project uses confirm mode, you MUST ask the user before calling this tool.',
    {
      feature_id: z.string().describe("Feature UUID to update."),
      operations: z
        .array(
          z.object({
            action: z.enum(["add", "update", "remove", "update_description"]),
            type: z
              .string()
              .optional()
              .describe(
                "Knowledge type for add: fact, decision, constraint, artifact, open_question.",
              ),
            content: z
              .string()
              .optional()
              .describe("Content text for add/update."),
            reason: z
              .string()
              .optional()
              .describe(
                "Why — critical for decisions and constraints. Without it, the next person may reverse your choice.",
              ),
            id: z
              .string()
              .optional()
              .describe("Knowledge item UUID for update/remove."),
            resolved: z
              .boolean()
              .optional()
              .describe("Set to true to mark an open_question as resolved."),
            metadata: z
              .record(z.string(), z.unknown())
              .optional()
              .describe("Additional metadata for the knowledge item."),
            description: z
              .string()
              .optional()
              .describe("New description text for update_description action."),
          }),
        )
        .describe("Array of operations to apply atomically."),
    },
    async ({ feature_id, operations }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      // Check confirm mode
      const pid = resolved.projectId;
      if (pid) {
        const mode = projectModes.get(pid);
        if (mode === "confirm") {
          // The instructions tell the model to ask the user first.
          // If the model calls this tool anyway, we still push — the
          // instructions are the enforcement mechanism, not the tool.
        }
      }

      try {
        const result = await resolved.client.pushContext(
          feature_id,
          operations,
        );

        // Update tracked version
        featureVersions.set(feature_id, result.version);

        return text({
          success: true,
          version: result.version,
          applied_operations: result.appliedOperations,
        });
      } catch (err) {
        return error(
          `Failed to push context: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_feature_diff
// ---------------------------------------------------------------------------

function registerSyncFeatureDiff(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_diff",
    "Get changes to a feature since a given version. Returns new knowledge items, updates, and description changes with author info. Call this during long sessions to check if teammates have updated the feature context.",
    {
      feature_id: z.string().describe("Feature UUID."),
      since_version: z
        .number()
        .optional()
        .describe(
          "Version to diff from. Defaults to the version from your last sync_feature_load call.",
        ),
    },
    async ({ feature_id, since_version }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const version =
        since_version ?? featureVersions.get(feature_id);
      if (version === undefined) {
        return error(
          "No known version for this feature. Load it first with sync_feature_load, or pass since_version explicitly.",
        );
      }

      try {
        const diff = await resolved.client.getFeatureDiff(feature_id, version);

        // Update tracked version
        if (diff.toVersion > version) {
          featureVersions.set(feature_id, diff.toVersion);
        }

        if (diff.changes.length === 0) {
          return text({
            message: "No changes since your last load.",
            version: diff.toVersion,
          });
        }

        return text(diff);
      } catch (err) {
        return error(
          `Failed to get diff: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_search
// ---------------------------------------------------------------------------

function registerSyncSearch(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_search",
    "Full-text search across features and knowledge items in the project. Use this to find related decisions, constraints, or features before starting new work. Also useful when the user references a feature by name and you need to find its ID.",
    {
      query: z.string().describe("Search query."),
      project_id: z
        .string()
        .optional()
        .describe("Project UUID. Defaults to active project."),
    },
    async ({ query, project_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const pid = project_id ?? resolved.projectId;
      if (!pid) return error("No active project. Pass project_id explicitly.");

      try {
        const results = await resolved.client.searchProject(pid, query);
        return text(results);
      } catch (err) {
        return error(
          `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

/**
 * Build the Sync protocol instructions block.
 * Only called when sync connections exist.
 */
export function buildSyncInstructions(config: SkillsConfig, syncJson?: SyncJson | null): string {
  const sync = config.sync;
  if (!sync?.connections?.length) return "";

  // Prefer syncJson binding over config active_connection
  const active = syncJson?.company ?? sync.active_connection ?? sync.connections[0]?.company;
  const projectId = syncJson?.project_id;
  const projectSlug = syncJson?.project_slug;
  const projectNote = projectId
    ? ` Active project: ${projectSlug ?? projectId} (auto-detected from .skillbase/sync.json).`
    : " No active project set — run spm sync init to bind this directory.";

  return `

SYNC PROTOCOL — Skillbase Sync is connected (company: "${active}").${projectNote} You have access to team knowledge and project context. Follow this protocol:

LOADING CONTEXT:
- When the user mentions a feature, task, or ticket (by name, slug, or ID) — call sync_feature_load IMMEDIATELY before starting work.
- sync_feature_load returns a lightweight map first. Based on the map, decide which knowledge types to load (decisions and constraints are almost always relevant; facts and artifacts — load on demand).
- Load project prompt once per session via sync_project_prompt. It contains project-wide conventions and architecture decisions.
- If you're unsure which feature to load, use sync_search to find it by name.
- Before starting any new feature work, search for related existing knowledge using sync_search — previous decisions and constraints from other features may apply.

SAVING KNOWLEDGE:
- As you work, actively record discoveries as structured knowledge. This is the primary value of Sync — the next person working on this feature gets your context.
- Save IMMEDIATELY when you discover something worth preserving — don't batch or defer. Each sync_feature_update call is atomic and versioned.
- What to save as each type:
  - fact: Verified, objective statement. Example: "gray-matter is CJS-only and incompatible with Turbopack"
  - decision: Architectural or implementation choice WITH the reason. Always include reason — without it, the next person may reverse your decision. Example: content="Use js-yaml instead of gray-matter", reason="Need pure ESM for Turbopack pipeline"
  - constraint: External limitation that narrows the solution space. Most expensive to lose. Example: "API response must be under 100KB due to mobile data budget"
  - artifact: File or config created/changed + summary. Example: content="proto/service.proto", reason="gRPC schema for internal services"
  - open_question: Unresolved item for handoff. Mark resolved when answered. Example: "Backward compat for mobile clients — need PM input"
- Do NOT save trivial or obvious things. Save what would cost someone else time to rediscover.
- The project's knowledge_update_mode controls behavior:
  - "auto": push updates immediately via sync_feature_update.
  - "confirm": ALWAYS present proposed knowledge to the user first. Wait for approval, then call sync_feature_update.

CHECKING FOR UPDATES:
- During long sessions, call sync_feature_diff to check if teammates added context.
- The feature map includes a version number — if changed, fetch diff, don't reload everything.
- When diff shows new constraints or decisions from others, acknowledge them and adjust your approach.

ENVIRONMENT:
- Use sync_status to verify connection and active project.
- Use sync_environment to compare project manifest against locally installed skills/personas. Suggest installing missing items.`;
}
