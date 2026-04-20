import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SkillsConfig, SyncJson } from "../types/index.js";
import { SyncClient, getSyncClient, getSyncClientForProject } from "../core/sync-client.js";
import { getSkillIndex } from "../core/registry.js";
import { writeSyncJson } from "../core/sync-json.js";
import type { DiscoveredSyncJson } from "../core/sync-json.js";

/**
 * Session state — tracks loaded feature versions for efficient diff checks.
 * Key: feature ID, Value: last known version.
 */
const featureVersions = new Map<string, number>();

/** Cached project knowledge_update_mode per project ID */
const projectModes = new Map<string, "auto" | "confirm">();

/** Cached project language (BCP-47) per project ID */
const projectLanguages = new Map<string, string>();

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

/** Discovered child project bindings (when running from parent directory) */
let discoveredProjects: DiscoveredSyncJson[] = [];

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
  childProjects?: DiscoveredSyncJson[],
): void {
  // Store syncJson for resolveClient
  activeSyncJson = syncJson ?? null;
  discoveredProjects = childProjects ?? [];

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
  if (config.tools.sync_project_list) {
    registerSyncProjectList(server, config);
  }
  if (config.tools.sync_project_create) {
    registerSyncProjectCreate(server, config);
  }
  if (config.tools.sync_project_update) {
    registerSyncProjectUpdate(server, config);
  }
  if (config.tools.sync_project_bind) {
    registerSyncProjectBind(server, config);
  }
  if (config.tools.sync_feature_load) {
    registerSyncFeatureLoad(server, config);
  }
  if (config.tools.sync_feature_create) {
    registerSyncFeatureCreate(server, config);
  }
  if (config.tools.sync_feature_edit) {
    registerSyncFeatureEdit(server, config);
  }
  if (config.tools.sync_feature_update) {
    registerSyncFeatureUpdate(server, config);
  }
  if (config.tools.sync_feature_delete) {
    registerSyncFeatureDelete(server, config);
  }
  if (config.tools.sync_feature_diff) {
    registerSyncFeatureDiff(server, config);
  }
  if (config.tools.sync_feature_comments) {
    registerSyncFeatureComments(server, config);
  }
  if (config.tools.sync_feature_link) {
    registerSyncFeatureLink(server, config);
  }
  if (config.tools.sync_knowledge_link) {
    registerSyncKnowledgeLink(server, config);
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

      // Fetch knowledge_update_mode + language for active project
      const resolved = resolveClient(config);
      let knowledgeUpdateMode: string | null = null;
      let language: string | null = null;
      if (resolved?.projectId) {
        try {
          const manifest = await resolved.client.getManifest(resolved.projectId);
          knowledgeUpdateMode = manifest.project.knowledgeUpdateMode;
          projectModes.set(resolved.projectId, manifest.project.knowledgeUpdateMode);
          if (manifest.project.language) {
            language = manifest.project.language;
            projectLanguages.set(resolved.projectId, manifest.project.language);
          }
        } catch {
          // Connection may be stale — report what we have
        }
      }

      const result: Record<string, unknown> = {
        connected: true,
        connections,
        active_project_id: resolved?.projectId ?? null,
        knowledge_update_mode: knowledgeUpdateMode,
        language,
      };

      // If no active project but child projects discovered, show them
      if (!resolved?.projectId && discoveredProjects.length > 0) {
        result.discovered_projects = discoveredProjects.map((d) => ({
          company: d.syncJson.company,
          project_id: d.syncJson.project_id,
          project_slug: d.syncJson.project_slug,
          directory: d.dir,
        }));
        result.hint = "No active project in current directory, but found project bindings in child directories. Use sync_feature_load/sync_feature_create with explicit project_id, or cd into the project directory.";
      }

      return text(result);
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
        if (prompt.language) projectLanguages.set(pid, prompt.language);

        if (!prompt.promptContent) {
          return text({
            message: "No project prompt configured yet.",
            version: prompt.promptVersion,
            language: prompt.language ?? null,
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                version: prompt.promptVersion,
                conventions: prompt.conventions,
                language: prompt.language ?? null,
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
    "Load feature context. First call returns a lightweight map (title, status, knowledge summary, version) plus graph neighbors and incoming_warnings at depth=1 by default — use these to discover related features without extra calls. Use the sections parameter to selectively load full knowledge items. Typical first load: sections=[\"decision\",\"constraint\",\"open_question\"]. Load \"fact\" and \"artifact\" sections on demand. If no feature_id is provided, pass a query to search by name/slug.",
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
          neighbors: map.neighbors,
          incoming_warnings: map.incoming_warnings,
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
// sync_feature_comments
// ---------------------------------------------------------------------------

function registerSyncFeatureComments(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_comments",
    "Pull human comments attached to a feature. Pull-only: comments are human-to-human by default and NOT auto-loaded with sync_feature_load. Call this tool when the user references a comment ('read my comment', 'see what I wrote on X', 'check the discussion') or when you want to catch up on discussion before making a decision. Accepted answers on open_questions are already promoted to knowledge_items.resolution — you do not need this tool for those. Use `since` (ISO timestamp) to get only new comments; use target_type+target_id to read a specific thread. Set with_targets=true to include previews of what each comment is attached to.",
    {
      feature_id: z.string().describe("Feature UUID."),
      since: z
        .string()
        .optional()
        .describe(
          "ISO 8601 timestamp — only return comments created after this instant. Use to fetch only new comments since your last check.",
        ),
      target_type: z
        .enum(["knowledge_item", "feature_version", "description_block", "comment"])
        .optional()
        .describe(
          "Narrow to comments on one kind of target. If set, target_id is required.",
        ),
      target_id: z
        .string()
        .optional()
        .describe(
          "Target identifier — UUID for knowledge_item/comment, block_id for description_block.",
        ),
      with_targets: z
        .boolean()
        .optional()
        .describe(
          "When true, returns a `targets` map with type+content preview for each referenced knowledge_item and description_block. Useful so you understand what each comment is attached to.",
        ),
      include_archived: z
        .boolean()
        .optional()
        .describe(
          "When true, includes comments archived because their description block was edited or removed. Default: excluded.",
        ),
    },
    async ({ feature_id, since, target_type, target_id, with_targets, include_archived }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      if (target_type && !target_id) {
        return error("target_id is required when target_type is specified.");
      }

      try {
        const result = await resolved.client.getFeatureComments(feature_id, {
          since,
          targetType: target_type,
          targetId: target_id,
          withTargets: with_targets,
          includeArchived: include_archived,
        });

        if (result.comments.length === 0) {
          return text({
            message: since
              ? "No new comments since the given timestamp."
              : "No comments on this feature.",
            comments: [],
          });
        }

        return text(result);
      } catch (err) {
        return error(
          `Failed to load comments: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_project_list
// ---------------------------------------------------------------------------

function registerSyncProjectList(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_project_list",
    "List all projects in a company. Returns project names, slugs, feature counts, and knowledge update modes. Use this to find a project before binding or switching.",
    {
      company: z
        .string()
        .optional()
        .describe("Company slug. Defaults to the active company."),
    },
    async ({ company }) => {
      const sync = config.sync;
      if (!sync?.connections?.length) return error("No Sync connection configured.");

      const companySlug = company ?? activeSyncJson?.company ?? sync.active_connection ?? sync.connections[0]?.company;
      if (!companySlug) return error("No company specified or active.");

      const connection = sync.connections.find((c) => c.company === companySlug);
      if (!connection) return error(`No connection for company "${companySlug}".`);

      const client = new SyncClient(connection.api, connection.key);

      try {
        const result = await client.listProjects(companySlug);
        return text(result);
      } catch (err) {
        return error(`Failed to list projects: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_project_create
// ---------------------------------------------------------------------------

function registerSyncProjectCreate(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_project_create",
    "Create a new project in a company. REQUIRES user confirmation before calling. Returns the created project with its ID.",
    {
      name: z.string().describe("Project display name."),
      slug: z.string().describe("URL-friendly slug (lowercase, hyphens, 3-63 chars). Example: my-project"),
      company: z
        .string()
        .optional()
        .describe("Company slug. Defaults to the active company."),
    },
    async ({ name, slug, company }) => {
      const sync = config.sync;
      if (!sync?.connections?.length) return error("No Sync connection configured.");

      const companySlug = company ?? activeSyncJson?.company ?? sync.active_connection ?? sync.connections[0]?.company;
      if (!companySlug) return error("No company specified or active.");

      const connection = sync.connections.find((c) => c.company === companySlug);
      if (!connection) return error(`No connection for company "${companySlug}".`);

      const client = new SyncClient(connection.api, connection.key);

      try {
        const result = await client.createProject(companySlug, name, slug);
        return text(result);
      } catch (err) {
        return error(`Failed to create project: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_project_update
// ---------------------------------------------------------------------------

function registerSyncProjectUpdate(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_project_update",
    "Update project settings: prompt content (CLAUDE.md equivalent), conventions, knowledge update mode, or name. Updating promptContent auto-increments the prompt version.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project UUID. Defaults to active project."),
      name: z.string().optional().describe("New project display name."),
      prompt_content: z.string().optional().describe("New project prompt content (CLAUDE.md equivalent). Full replacement — send the complete text."),
      conventions: z.record(z.string(), z.unknown()).optional().describe("Project conventions object."),
      knowledge_update_mode: z.enum(["auto", "confirm"]).optional().describe("How agents should handle knowledge updates: auto (push immediately) or confirm (ask user first)."),
      language: z
        .string()
        .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/)
        .optional()
        .describe("BCP-47 language code (e.g. 'en', 'ru', 'es', 'pt-BR'). Sets the language agents use to write feature documentation, knowledge, and comments. REQUIRES user confirmation — do not change without explicit request."),
    },
    async ({ project_id, name, prompt_content, conventions, knowledge_update_mode, language }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const pid = project_id ?? resolved.projectId;
      if (!pid) return error("No active project. Pass project_id explicitly.");

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (prompt_content !== undefined) updates.promptContent = prompt_content;
      if (conventions !== undefined) updates.conventions = conventions;
      if (knowledge_update_mode !== undefined) updates.knowledgeUpdateMode = knowledge_update_mode;
      if (language !== undefined) updates.language = language;

      if (Object.keys(updates).length === 0) {
        return error("No updates provided. Pass at least one field to update.");
      }

      try {
        const result = await resolved.client.updateProject(pid, updates as Parameters<typeof resolved.client.updateProject>[1]);
        return text(result);
      } catch (err) {
        return error(`Failed to update project: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_project_bind
// ---------------------------------------------------------------------------

function registerSyncProjectBind(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_project_bind",
    "Bind the current working directory to a Sync project by creating .skillbase/sync.json. This makes the project automatically active when agents run from this directory. After binding, the project context is available without passing project_id explicitly.",
    {
      project_id: z.string().describe("Project UUID to bind."),
      project_slug: z.string().describe("Project slug (for display in sync.json)."),
      company: z
        .string()
        .optional()
        .describe("Company slug. Defaults to the active company."),
    },
    async ({ project_id, project_slug, company }) => {
      const sync = config.sync;
      if (!sync?.connections?.length) return error("No Sync connection configured.");

      const companySlug = company ?? sync.active_connection ?? sync.connections[0]?.company;
      if (!companySlug) return error("No company specified or active.");

      const connection = sync.connections.find((c) => c.company === companySlug);
      if (!connection) return error(`No connection for company "${companySlug}".`);

      try {
        const cwd = process.cwd();
        const data: SyncJson = {
          company: companySlug,
          project_id,
          project_slug,
        };
        await writeSyncJson(cwd, data);

        // Update module-level binding so subsequent calls use this project
        activeSyncJson = data;

        return text({
          bound: true,
          directory: cwd,
          company: companySlug,
          project_id,
          project_slug,
        });
      } catch (err) {
        return error(`Failed to bind project: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_feature_create
// ---------------------------------------------------------------------------

function registerSyncFeatureCreate(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_create",
    "Create a new feature in the active project. Returns the created feature with its ID and version. Use the ID for subsequent sync_feature_update calls to add knowledge items.",
    {
      title: z.string().describe("Feature display title."),
      slug: z.string().describe("URL-friendly slug (lowercase, hyphens, 3-63 chars). Example: auth-refactor"),
      description: z.string().optional().describe("Feature description text. Supports markdown."),
      status: z
        .enum(["draft", "active", "review", "done", "archived"])
        .optional()
        .describe("Initial status. Defaults to draft."),
      project_id: z
        .string()
        .optional()
        .describe("Project UUID. Defaults to active project."),
    },
    async ({ title, slug, description, status, project_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const pid = project_id ?? resolved.projectId;
      if (!pid) return error("No active project. Pass project_id explicitly.");

      try {
        const result = await resolved.client.createFeature(pid, {
          title,
          slug,
          description,
          status,
        });
        return text(result);
      } catch (err) {
        return error(`Failed to create feature: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_feature_edit
// ---------------------------------------------------------------------------

function registerSyncFeatureEdit(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_edit",
    "Update feature metadata: title, status, description, or links. This is different from sync_feature_update which manages knowledge items. Use this to change a feature's status (e.g. draft → active → done) or update its description.",
    {
      feature_id: z.string().describe("Feature UUID to edit."),
      title: z.string().optional().describe("New feature title."),
      status: z
        .enum(["draft", "active", "review", "done", "archived"])
        .optional()
        .describe("New feature status."),
      description: z.string().optional().describe("New feature description. Full replacement."),
      links: z.array(z.unknown()).optional().describe("New links array. Full replacement."),
    },
    async ({ feature_id, title, status, description, links }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      const updates: Record<string, unknown> = {};
      if (title !== undefined) updates.title = title;
      if (status !== undefined) updates.status = status;
      if (description !== undefined) updates.description = description;
      if (links !== undefined) updates.links = links;

      if (Object.keys(updates).length === 0) {
        return error("No updates provided. Pass at least one field to update.");
      }

      try {
        const result = await resolved.client.updateFeature(feature_id, updates as Parameters<typeof resolved.client.updateFeature>[1]);
        return text(result);
      } catch (err) {
        return error(`Failed to edit feature: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_feature_delete
// ---------------------------------------------------------------------------

function registerSyncFeatureDelete(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_delete",
    "Delete a feature and all its knowledge items. This is IRREVERSIBLE. REQUIRES user confirmation before calling.",
    {
      feature_id: z.string().describe("Feature UUID to delete."),
    },
    async ({ feature_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      try {
        const result = await resolved.client.deleteFeature(feature_id);
        // Clean up tracked version
        featureVersions.delete(feature_id);
        return text(result);
      } catch (err) {
        return error(`Failed to delete feature: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_feature_link
// ---------------------------------------------------------------------------

const LINK_TYPE_ENUM = [
  "depends_on",
  "blocks",
  "supersedes",
  "references",
  "shares_constraint",
  "split_from",
] as const;

function registerSyncFeatureLink(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_feature_link",
    "Create a typed edge between two features (cross-project within the same company). Use this to record depends_on/blocks/supersedes/references/shares_constraint/split_from relationships. Does NOT bump feature.version — links are metadata, not content. Both features must belong to the same company. Pass a human-readable reason so the link is understandable without extra context.",
    {
      source_id: z.string().describe("Source feature UUID (the 'from' end of the edge)."),
      target_id: z.string().describe("Target feature UUID (the 'to' end of the edge)."),
      type: z.enum(LINK_TYPE_ENUM).describe("Edge type: depends_on | blocks | supersedes | references | shares_constraint | split_from."),
      reason: z.string().describe("Why this link exists — surfaced in the graph so others see the rationale."),
    },
    async ({ source_id, target_id, type, reason }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      try {
        const result = await resolved.client.createFeatureLink({
          source_id,
          target_id,
          type,
          reason,
        });
        return text(result);
      } catch (err) {
        return error(`Failed to create feature link: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "sync_feature_unlink",
    "Remove a feature link by its ID.",
    {
      link_id: z.string().describe("Feature link UUID to delete."),
    },
    async ({ link_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      try {
        const result = await resolved.client.deleteFeatureLink(link_id);
        return text(result);
      } catch (err) {
        return error(`Failed to delete feature link: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// sync_knowledge_link
// ---------------------------------------------------------------------------

function registerSyncKnowledgeLink(server: McpServer, config: SkillsConfig): void {
  server.tool(
    "sync_knowledge_link",
    "Create a typed edge between two knowledge items that live in DIFFERENT features (same-feature links are forbidden — items inside one feature load together anyway). Use for item-level reasoning: 'decision A in feature X supersedes decision B in feature Y'. Same edge vocabulary as sync_feature_link.",
    {
      source_item_id: z.string().describe("Source knowledge item UUID."),
      target_item_id: z.string().describe("Target knowledge item UUID (must live in a different feature)."),
      type: z.enum(LINK_TYPE_ENUM).describe("Edge type: depends_on | blocks | supersedes | references | shares_constraint | split_from."),
      reason: z.string().describe("Why this link exists."),
    },
    async ({ source_item_id, target_item_id, type, reason }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      try {
        const result = await resolved.client.createKnowledgeLink({
          source_item_id,
          target_item_id,
          type,
          reason,
        });
        return text(result);
      } catch (err) {
        return error(`Failed to create knowledge link: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  server.tool(
    "sync_knowledge_unlink",
    "Remove a knowledge link by its ID.",
    {
      link_id: z.string().describe("Knowledge link UUID to delete."),
    },
    async ({ link_id }) => {
      const resolved = resolveClient(config);
      if (!resolved) return error("No Sync connection configured.");

      try {
        const result = await resolved.client.deleteKnowledgeLink(link_id);
        return text(result);
      } catch (err) {
        return error(`Failed to delete knowledge link: ${err instanceof Error ? err.message : String(err)}`);
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
export function buildSyncInstructions(
  config: SkillsConfig,
  syncJson?: SyncJson | null,
  childProjects?: DiscoveredSyncJson[],
): string {
  const sync = config.sync;
  if (!sync?.connections?.length) return "";

  // Prefer syncJson binding over config active_connection
  const active = syncJson?.company ?? sync.active_connection ?? sync.connections[0]?.company;
  const projectId = syncJson?.project_id;
  const projectSlug = syncJson?.project_slug;

  let projectNote: string;
  if (projectId) {
    projectNote = ` Active project: ${projectSlug ?? projectId} (auto-detected from .skillbase/sync.json).`;
  } else if (childProjects?.length) {
    const list = childProjects
      .map((d) => `  - ${d.syncJson.project_slug} (${d.syncJson.project_id}) in ${d.dir}`)
      .join("\n");
    projectNote = ` No active project in current directory, but found ${childProjects.length} project(s) in child directories:\n${list}\nPass project_id explicitly to tools, or use sync_project_bind to bind this directory.`;
  } else {
    projectNote = " No active project set — use sync_project_bind to bind this directory, or pass project_id explicitly.";
  }

  const companies = sync.connections.map((c) => c.company).join(", ");

  return `

SYNC PROTOCOL — Skillbase Sync is connected (company: "${active}", available: [${companies}]).${projectNote}

You have access to team knowledge and project context via Sync. This is your structured memory — it persists across sessions and is shared with teammates and other agents.

SESSION START (do this first):
1. Call sync_status to confirm connection, identify the active project, and capture its "language" field. If no active project but child projects are discovered, note their project_ids for explicit use.
2. Call sync_project_prompt to load project-wide context (tech stack, conventions, architecture, documentation language). This is equivalent to reading CLAUDE.md — do it once per session, reload only if version changed. Lock in the returned "language" as the mandatory language for all Sync writes this session.
3. If the user's task relates to a specific feature, call sync_feature_load or sync_search immediately to get existing context before starting work.
4. Call sync_environment to check if all required skills/personas are installed. Suggest installing missing ones.

SETUP & NAVIGATION:
- Use sync_project_list to see all projects in a company.
- Use sync_project_bind to bind the current directory to a project (creates .skillbase/sync.json). After binding, all tools default to this project.
- If no active project: sync_status shows projects discovered in child directories. Use their project_id explicitly, or sync_project_bind to set one as default.

LOADING CONTEXT:
- When the user mentions a feature, task, or ticket — call sync_feature_load IMMEDIATELY before starting work.
- sync_feature_load returns a lightweight map first. Then load sections selectively: decisions and constraints are almost always relevant; facts and artifacts — on demand.
- ALWAYS sync_search before creating a new feature — avoid duplicates. Search by name, keywords, or related concepts.
- Before starting any new feature work, search for related existing knowledge — previous decisions and constraints from other features may apply.

CREATING & MANAGING FEATURES:
- Use sync_feature_create to create new features. Always provide a meaningful slug (lowercase, hyphens, 3-63 chars).
- Feature description = scope and purpose. What the feature is, what problem it solves, what's in/out of scope. Treat it as the README a new reader sees first.
- AUTHORING DISCIPLINE for description (critical — you are usually the author, so follow these rules strictly):
  - Structure: short preamble (1-3 paragraphs of prose stating the goal) + clearly separated sections under descriptive '##' headings. Sections should be self-contained — a reader should understand a section without cross-referencing others. Avoid "see Section 3" style internal links.
  - Use DESCRIPTIVE headings: "## Порядок работ", "## Backend API", "## UX поток", "## Ограничения". Not generic: "## Детали", "## Примечания", "## Разное". A reader must be able to infer section content from the heading alone.
  - DO NOT put structured decisions, constraints, or open questions inline in description. They go as knowledge items:
    - architectural choice with rationale → decision (with reason)
    - hard limit or external constraint → constraint
    - unresolved item → open_question
    - key file/config → artifact
    - verified behavior → fact
  - If a description section starts listing "Decisions:" or "Constraints:" or "TODO:" — stop and convert those to knowledge items instead. Keep description narrative, keep structured data structured.
  - Length: no hard cap, but if a description exceeds ~3K characters without distinct sections, it's a sign structure is missing or that some content belongs in knowledge items or artifacts.
- Feature STATUS must always reflect the CURRENT state of the work. Update it live via sync_feature_edit as you progress — do not leave it stale.
  - "draft" → planned / to do. Scope is captured but work has not started, OR the feature is a stub to fill later.
  - "active" → in progress. Someone (you, the user, or a teammate) is currently working on this feature. Set this the moment you start executing on it.
  - "review" → implementation is finished but requires the user's (or a teammate's) review/validation before being considered complete. Use this when you have finished a chunk of work that the user needs to check (e.g. PR opened, changes made locally, acceptance criteria subjective).
  - "done" → fully completed AND verified: checks pass, user has approved, work is merged/shipped, or all acceptance criteria are objectively met. Do NOT set "done" preemptively — go through "review" first whenever the user's judgment is needed.
  - "archived" → no longer relevant (cancelled, superseded, out of scope).
- Transition rules:
  - On starting execution → move draft/planned feature to "active".
  - When you believe the work is complete but the user has not yet signed off → set "review" and surface what needs checking.
  - Only move to "done" after explicit user confirmation OR when automated checks (tests, CI, deployment) objectively prove completion with no remaining ambiguity.
  - If the user pushes back or asks for more changes after "review", move back to "active".
- Links: attach relevant URLs (PRs, issues, docs, designs) to features via sync_feature_edit with links array. Format: [{url, title}].
- Use sync_feature_delete only with user confirmation — it's irreversible.

LANGUAGE (MANDATORY — the project has a configured documentation language):
- Every project has a "language" field (BCP-47 code). Read it from sync_status or sync_project_prompt and treat it as a hard constraint.
- ALL content you write into Sync MUST be in that language: feature titles, descriptions, knowledge items (fact/decision/constraint/artifact/open_question), reasons, comments, project prompts, conventions.
- This applies regardless of which language the user speaks to you in. If the user chats in English but the project language is Russian, you still write Sync content in Russian.
- Exception: identifiers that are part of code or systems (slugs, file paths, variable names, API fields, package names, URLs) stay as-is — translate the prose around them, not the identifiers.
- Exception: exact quotes from the codebase, commit messages, or external documents remain in their original language.
- If the project language is missing (null), default to English and gently ask the user to set one via sync_project_update.
- Before writing to Sync, double-check: "is this text in {project.language}?" — mixed-language Sync content is a bug.

SAVING KNOWLEDGE (this is the primary value of Sync — be aggressive, not cautious):
- Save IMMEDIATELY when triggered — do NOT batch, do NOT defer to "end of task", do NOT wait until you're sure. Each sync_feature_update call is atomic and versioned, so there's no downside to saving and refining later. The downside of NOT saving is that the next session loses context — that is the failure mode to avoid.
- Save triggers — call sync_feature_update when ANY of these happen:
  1. You answer a "why" / "why not" question — save as decision with reason.
  2. User corrects your approach or preference ("no, don't do X") — save as decision with reason='user preference: explained X'.
  3. You discover non-obvious behavior (bug, config quirk, library limitation) — save as fact.
  4. You hit an external limit (API quota, browser constraint, legal requirement) — save as constraint.
  5. You create/modify a load-bearing file (schema, migration, config) — save as artifact.
  6. An unresolved question comes up — save as open_question; mark resolved=true the moment it's answered (the answer goes in the accepted-answer comment or in the resolved knowledge item).
  7. User says "remember that" / "note that" / "for next time" — save immediately.
  8. You finish a non-trivial implementation step — sweep: what decisions did I make? what did I discover? save them.
- What each type is for:
  - fact: Verified, objective statement. Example: "gray-matter is CJS-only and incompatible with Turbopack"
  - decision: Architectural or implementation choice. ALWAYS include reason. Example: content="Use js-yaml instead of gray-matter", reason="Need pure ESM for Turbopack pipeline"
  - constraint: External limit narrowing the solution space. Most expensive type to lose. Example: "API response must be under 100KB due to mobile data budget"
  - artifact: Key file/config that was created or changed, with context. Example: content="proto/service.proto", reason="gRPC schema, auto-generates Go/TS types"
  - open_question: Unresolved item. Mark resolved=true when answered.
- Quality bar: save what would cost someone 30+ minutes to rediscover. Do NOT save trivial things (obvious from code) or ephemeral state (current debug values). But when in doubt, SAVE — refining is cheap, rediscovering is expensive.
- The project's knowledge_update_mode controls behavior:
  - "auto": push updates immediately via sync_feature_update (no confirmation needed).
  - "confirm": present proposed knowledge to the user first (type, content, reason). Wait for approval, then push. In confirm mode, still propose aggressively — missing a save is worse than proposing one that gets rejected.

COMMENTS (human-to-human discussion, pull-only — NOT auto-loaded):
- Comments on features are human discussion threads. They are NOT loaded by sync_feature_load or sync_feature_diff to keep your context clean.
- Accepted answers on open_questions ARE auto-promoted — they appear in knowledge_items.resolution, so you already see them via knowledge endpoints. Do not pull comments just to find an accepted answer.
- Call sync_feature_comments ONLY when the user explicitly references a comment or asks you to read discussion. Examples: "check the comment I left on the auth question", "read what the team wrote about this", "look at the review thread". Without such a cue, skip comments — they are not part of your default working context.
- When calling sync_feature_comments, prefer 'since' to fetch only new comments (pass the ISO timestamp from your last check). Pass with_targets=true so you see what each comment is attached to without a second round-trip.

DOCUMENTING A PROJECT (when asked to analyze/document a codebase):
1. Read and understand the codebase structure, tech stack, architecture.
2. Update the project prompt via sync_project_update with prompt_content. Include: project purpose, tech stack, key architectural patterns, development conventions, deployment setup. This is what every agent reads on session start.
3. Create features for each major area/component/initiative. Use descriptive slugs and clear descriptions.
4. For each feature, add knowledge items: facts about the implementation, decisions that were made (with reasons from git history/code comments), constraints discovered, key artifacts, and open questions.
5. Set feature status per the rules above: "draft" for stubs/planned work, "active" for in-progress areas, "review" when finished but waiting on user validation, "done" only for verified/completed areas.

PROJECT MANAGEMENT:
- Use sync_project_create to create new projects (requires user confirmation).
- sync_project_update fields:
  - prompt_content: Project-wide context for all agents. Structure it as: purpose, tech stack, architecture overview, conventions, deployment. This is the equivalent of CLAUDE.md but shared and versioned.
  - conventions: Structured key-value object for machine-readable conventions (naming, formatting, patterns).
  - knowledge_update_mode: "auto" (agents push immediately) or "confirm" (agents ask user first).
  - language: BCP-47 code for the documentation language (en, ru, es, pt-BR, ...). Only change on explicit user request — this affects how all agents write Sync content.

CHECKING FOR UPDATES:
- During long sessions, call sync_feature_diff to check if teammates or other agents added context.
- The feature map includes a version number — if it changed since your last load, fetch diff, don't reload everything.
- When diff shows new constraints or decisions from others, acknowledge them and adjust your approach.`;
}
