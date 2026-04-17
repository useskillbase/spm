import path from "node:path";
import { execFileSync } from "node:child_process";
import { readConfig, writeConfig } from "../../core/config.js";
import { SyncClient, getSyncClient, getSyncClientForProject } from "../../core/sync-client.js";
import { getSkillIndex } from "../../core/registry.js";
import { installSingleFromRegistry, resolveSkillsDir } from "./add.js";
import { getClientForSkill } from "../../core/registry-client.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { readSyncJson, writeSyncJson, findSyncJson } from "../../core/sync-json.js";
import { log, spinner, exitError, intro, select, text, isCancel, cancel, confirm } from "../ui.js";
import type { CommandDef } from "../command.js";
import type { SyncManifest } from "../../types/index.js";

export const command: CommandDef = {
  name: "sync",
  description: "Sync local environment with Sync project",
  group: "system",
  args: [
    {
      name: "project",
      required: false,
      description: "Project slug (defaults to .skillbase/sync.json or active project)",
    },
  ],
  options: [
    {
      flags: "--status",
      description: "Check only, don't install (dry run)",
    },
    {
      flags: "--company <slug>",
      description: "Sync all projects for a company",
    },
  ],
  subcommands: [
    {
      name: "init",
      description: "Initialize project binding — create .skillbase/sync.json",
      group: "system",
      handler: initCommand,
    },
  ],
  handler: syncCommand,
};

// ---------------------------------------------------------------------------
// spm sync [project] [--status] [--company]
// ---------------------------------------------------------------------------

async function syncCommand(
  project: string | undefined,
  options: {
    status?: boolean;
    company?: string;
  },
): Promise<void> {
  const config = await readConfig();

  // --company: sync all projects
  if (options.company) {
    const resolved = getSyncClient(config);
    if (!resolved) exitError("No Sync connection configured.");
    await syncCompany(resolved.client, options.company, options.status ?? false);
    return;
  }

  // Try to resolve project from .skillbase/sync.json first
  const cwd = process.cwd();
  const syncJsonResult = await findSyncJson(cwd);

  let client: SyncClient;
  let projectId: string | undefined;
  let projectSlug: string | undefined;

  if (project) {
    // Explicit slug passed — need a connection to resolve
    const resolved = getSyncClient(config);
    if (!resolved) exitError("No Sync connection configured.");
    client = resolved.client;
    projectSlug = project;
    projectId = await resolveProjectId(client, resolved.connection.company, project);
  } else if (syncJsonResult) {
    // Use .skillbase/sync.json binding
    const resolved = getSyncClientForProject(config, syncJsonResult.syncJson);
    if (!resolved) {
      exitError(
        `No Sync connection for company "${syncJsonResult.syncJson.company}". Run: spm connect sync`,
      );
    }
    client = resolved.client;
    projectId = resolved.projectId;
    projectSlug = syncJsonResult.syncJson.project_slug;
  } else {
    // Fallback to active connection's project_id
    const resolved = getSyncClient(config);
    if (!resolved) exitError("No Sync connection configured. Run: spm sync init");
    if (!resolved.connection.project_id) {
      exitError(
        "No project bound to this directory. Run: spm sync init",
      );
    }
    client = resolved.client;
    projectId = resolved.connection.project_id;
  }

  await syncProject(client, projectId!, projectSlug, options.status ?? false);
}

// ---------------------------------------------------------------------------
// spm sync init
// ---------------------------------------------------------------------------

async function initCommand(): Promise<void> {
  const config = await readConfig();
  const connections = config.sync?.connections ?? [];

  if (connections.length === 0) {
    exitError("No Sync connections configured. Connect first via Sync web UI or run: spm connect sync");
  }

  intro("Skillbase Sync — Initialize project");

  // 1. Select company (auto-select if only one)
  let companySlug: string;
  let connectionIdx: number;

  if (connections.length === 1) {
    companySlug = connections[0].company;
    connectionIdx = 0;
    log.info(`Company: ${companySlug}`);
  } else {
    const choice = await select({
      message: "Select company:",
      options: connections.map((c, i) => ({
        value: String(i),
        label: c.company,
        hint: c.api,
      })),
    });

    if (isCancel(choice)) {
      cancel("Cancelled.");
      process.exit(0);
    }

    connectionIdx = parseInt(choice as string, 10);
    companySlug = connections[connectionIdx].company;
  }

  const conn = connections[connectionIdx];
  const client = new SyncClient(conn.api, conn.key);

  // 2. Fetch projects and let user pick or create
  const s = spinner();
  s.start("Loading projects...");

  let projects: Array<{ id: string; slug: string; name: string }>;
  try {
    const result = await client.listProjects(companySlug);
    projects = result.projects;
    s.stop();
  } catch (err) {
    s.stop();
    exitError(`Failed to load projects: ${err instanceof Error ? err.message : String(err)}`);
  }

  const CREATE_NEW = "__create_new__";

  const projectOptions = [
    ...projects.map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.slug,
    })),
    {
      value: CREATE_NEW,
      label: "+ Create new project",
    },
  ];

  const projectChoice = await select({
    message: "Select project:",
    options: projectOptions,
  });

  if (isCancel(projectChoice)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  let projectId: string;
  let selectedSlug: string;

  if (projectChoice === CREATE_NEW) {
    // Auto-suggest slug from directory name
    const dirName = path.basename(process.cwd());
    const suggestedSlug = dirName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const nameInput = await text({
      message: "Project name:",
      placeholder: dirName,
    });

    if (isCancel(nameInput) || !nameInput) {
      cancel("Cancelled.");
      process.exit(0);
    }

    const projectName = (nameInput as string).trim();
    const slugFromName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const slugInput = await text({
      message: "Project slug:",
      placeholder: suggestedSlug || slugFromName,
      defaultValue: suggestedSlug || slugFromName,
    });

    if (isCancel(slugInput)) {
      cancel("Cancelled.");
      process.exit(0);
    }

    const projectSlugValue = (slugInput as string).trim() || suggestedSlug || slugFromName;

    const createS = spinner();
    createS.start("Creating project...");

    try {
      const result = await client.createProject(companySlug, projectName, projectSlugValue);
      projectId = result.project.id;
      selectedSlug = result.project.slug;
      createS.stop();
      log.success(`Created project "${projectName}" (${selectedSlug})`);
    } catch (err) {
      createS.stop();
      exitError(`Failed to create project: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    projectId = projectChoice as string;
    const match = projects.find((p) => p.id === projectId);
    selectedSlug = match?.slug ?? projectId;
  }

  // 3. Offer to add git remote as project link
  await maybeAddGitLink(client, projectId);

  // 4. Write .skillbase/sync.json
  const cwd = process.cwd();
  await writeSyncJson(cwd, {
    company: companySlug,
    project_id: projectId,
    project_slug: selectedSlug,
  });

  log.success(`Created .skillbase/sync.json — project "${selectedSlug}" linked to ${companySlug}.`);
}

function getGitRemoteUrl(): string | null {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim() || null;
  } catch {
    return null;
  }
}

async function maybeAddGitLink(client: SyncClient, projectId: string): Promise<void> {
  const remoteUrl = getGitRemoteUrl();
  if (!remoteUrl) return;

  const shouldAdd = await confirm({
    message: `Add git remote as project link?\n  ${remoteUrl}`,
  });

  if (isCancel(shouldAdd) || !shouldAdd) return;

  try {
    await client.updateProject(projectId, {
      links: [{ type: "github", url: remoteUrl }],
    });
    log.success("Added git remote as project link.");
  } catch {
    log.warning("Failed to add git link — you can add it manually in the web UI.");
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function resolveProjectId(
  client: SyncClient,
  companySlug: string,
  projectSlug: string,
): Promise<string> {
  const s = spinner();
  s.start(`Resolving project "${projectSlug}"...`);

  try {
    const { projects } = await client.listProjects(companySlug);
    const match = projects.find((p) => p.slug === projectSlug);
    s.stop();

    if (!match) {
      const available = projects.map((p) => p.slug).join(", ");
      exitError(
        `Project "${projectSlug}" not found in company "${companySlug}". Available: ${available || "none"}`,
      );
    }

    return match.id;
  } catch (err) {
    s.stop();
    exitError(
      `Failed to resolve project: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function syncProject(
  client: SyncClient,
  projectId: string,
  projectSlug: string | undefined,
  dryRun: boolean,
): Promise<void> {
  const s = spinner();
  const label = projectSlug ?? projectId.slice(0, 8);
  s.start(`Syncing with ${label}...`);

  let manifest: SyncManifest;
  try {
    manifest = await client.getManifest(projectId);
  } catch (err) {
    s.stop();
    exitError(
      `Failed to fetch manifest: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  s.stop();

  const index = await getSkillIndex();
  const installedNames = new Set(index.skills.map((sk) => sk.name));

  const allRequired = [
    ...manifest.skills.map((sk) => ({
      name: sk.skillName,
      version: sk.skillVersion,
      type: "skill" as const,
    })),
    ...manifest.personas.map((p) => ({
      name: p.personaName,
      version: p.personaVersion,
      type: "persona" as const,
    })),
  ];

  const missing = allRequired.filter((pkg) => !installedNames.has(pkg.name));
  const upToDate = allRequired.filter((pkg) => installedNames.has(pkg.name));

  for (const pkg of upToDate) {
    log.success(`${pkg.name}  up to date`);
  }

  if (missing.length === 0) {
    log.success(
      `\nAll ${allRequired.length} packages up to date. Nothing to install.`,
    );
    return;
  }

  if (dryRun) {
    for (const pkg of missing) {
      log.warning(`${pkg.name}@${pkg.version}  missing`);
    }
    log.info(
      `\n${missing.length} package(s) to install. Run without --status to install.`,
    );
    return;
  }

  const config = await readConfig();
  const { skillsDir } = await resolveSkillsDir(true);
  let installed = 0;
  let failed = 0;

  for (const pkg of missing) {
    const parts = pkg.name.split("/");
    if (parts.length !== 2) {
      log.error(`${pkg.name}  invalid format (expected author/name)`);
      failed++;
      continue;
    }

    const [author, name] = parts;
    const registryClient = getClientForSkill(config, pkg.name);
    if (!registryClient) {
      log.error(`${pkg.name}  no registry configured`);
      failed++;
      continue;
    }

    const installS = spinner();
    installS.start(`Installing ${pkg.name}@${pkg.version}...`);

    try {
      const version = pkg.version === "latest" ? undefined : pkg.version;
      await installSingleFromRegistry(author, name, skillsDir, registryClient, version);
      installS.stop();
      log.success(`${pkg.name}@${pkg.version}  installed`);
      installed++;
    } catch (err) {
      installS.stop();
      log.error(
        `${pkg.name}  failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      failed++;
    }
  }

  await writeIndex(skillsDir);
  await writeLock(skillsDir);

  const parts: string[] = [];
  if (installed > 0) parts.push(`${installed} installed`);
  if (upToDate.length > 0) parts.push(`${upToDate.length} up to date`);
  if (failed > 0) parts.push(`${failed} failed`);
  log.success(`\n${parts.join(", ")}. Done.`);
}

async function syncCompany(
  client: SyncClient,
  companySlug: string,
  dryRun: boolean,
): Promise<void> {
  const s = spinner();
  s.start(`Fetching projects for ${companySlug}...`);

  let projects: Array<{ id: string; slug: string; name: string }>;
  try {
    const result = await client.listProjects(companySlug);
    projects = result.projects;
  } catch (err) {
    s.stop();
    exitError(
      `Failed to list projects: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  s.stop();

  if (projects.length === 0) {
    log.info("No projects found.");
    return;
  }

  log.info(`Found ${projects.length} project(s) in ${companySlug}\n`);

  for (const proj of projects) {
    log.info(`--- ${proj.name} (${proj.slug}) ---`);
    await syncProject(client, proj.id, proj.slug, dryRun);
    log.info("");
  }
}
