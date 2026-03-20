import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
  listPersonas,
  readPersona,
  installPersona,
  setActivePersona,
} from "../../core/persona.js";
import { readConfig } from "../../core/config.js";
import { getClientForSkill } from "../../core/registry-client.js";
import { getSkillIndex, findSkill } from "../../core/registry.js";
import { loadSkill } from "../../core/loader.js";
import { validateSoulFrontmatter } from "../../schema/persona-schema.js";
import { parseSoul } from "../../core/persona-parser.js";
import { installSingleFromRegistry, installFromRegistry, resolveSkillsDir } from "./add.js";
import { getTarget, getAllTargetIds } from "../../targets/index.js";
import type { ParsedSoul, LoadedSkill } from "../../types/index.js";
import { log, spinner, note, multiselect, isCancel, cancel, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

function parseSkillRef(ref: string): { author: string; name: string } | null {
  const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (!match) return null;
  return { author: match[1], name: match[2] };
}

function buildSoulTemplate(name: string): string {
  return matter.stringify(
    [
      "",
      "## Role",
      "",
      "TODO: describe the persona's role and expertise.",
      "",
      "## Tone",
      "",
      "TODO: e.g. professional, friendly, concise",
      "",
      "## Guidelines",
      "",
      "- TODO: add behavioral guidelines",
      "",
    ].join("\n"),
    {
      name,
      version: "1.0.0",
      author: "TODO",
      license: "MIT",
      description: `TODO: describe ${name} persona`,
      skillbase: {
        schema_version: 3,
        trigger: {
          description: `TODO: describe when to use ${name}`,
          tags: ["TODO"],
          priority: 50,
        },
        skills: {},
        settings: {
          temperature: 0.3,
        },
      },
    },
  );
}

// --- Handlers ---

async function personaCreateCommand(name: string): Promise<void> {
  const fileName = "SOUL.md";
  const dirPath = path.resolve(name);
  const filePath = path.join(dirPath, fileName);

  try {
    await fs.access(filePath);
    exitError(`File "${filePath}" already exists.`);
  } catch {
    // Doesn't exist — good
  }

  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, buildSoulTemplate(name), "utf-8");

  log.success(`Created persona scaffold: ${filePath}`);
  note(
    `1. Edit ${filePath} — set character and settings\n2. spm persona activate author/${name}`,
    "Next steps",
  );
}

async function personaListCommand(): Promise<void> {
  const config = await readConfig();
  const personas = await listPersonas();

  if (personas.length === 0) {
    log.info("No personas installed.");
    log.message('Use `spm persona create <name>` to create one.');
    return;
  }

  for (const p of personas) {
    const ref = `${p.author}/${p.name}`;
    const active = config.active_persona === ref ? " (active)" : "";
    log.message(
      `${ref}@${p.version}${active} — ${p.description} [${p.dependencies_count} skills]`,
    );
  }
}

export async function personaActivateCommand(name: string): Promise<void> {
  let persona = await readPersona(name);

  // If not installed, try to find SOUL.md in cwd
  if (!persona) {
    const soulPath = path.resolve(name, "SOUL.md");
    try {
      await fs.access(soulPath);
      const installed = await installPersona(soulPath, { global: true });
      const ref = `${installed.frontmatter.author}/${installed.frontmatter.name}`;
      log.success(`Installed persona from ${soulPath}`);
      name = ref;
      persona = installed;
    } catch {
      // Not in cwd either
    }
  }

  // Try registry fallback
  if (!persona) {
    const parsed = parseSkillRef(name);
    if (parsed) {
      const config = await readConfig();
      const client = getClientForSkill(config, name);
      if (client) {
        try {
          log.step(`Searching registry for ${name}...`);
          const { skillsDir, isProject } = await resolveSkillsDir();
          await installFromRegistry(name, skillsDir, isProject);
          persona = await readPersona(name);
        } catch {
          // Not in registry either
        }
      }
    }
  }

  if (!persona) {
    exitError(`Persona "${name}" not found locally or in registry.`);
  }

  // Auto-install missing skills
  const skills = persona.frontmatter.skillbase?.skills;
  if (skills) {
    const skillRefs = Object.keys(skills);
    if (skillRefs.length > 0) {
      const index = await getSkillIndex();
      const missing: string[] = [];

      for (const ref of skillRefs) {
        if (!findSkill(index, ref)) {
          missing.push(ref);
        }
      }

      if (missing.length > 0) {
        log.step(`Installing ${missing.length} missing skill(s)...`);
        const config = await readConfig();
        const { skillsDir } = await resolveSkillsDir();

        for (const ref of missing) {
          const parsed = parseSkillRef(ref);
          if (!parsed) {
            log.warning(`Skipping invalid ref: ${ref}`);
            continue;
          }

          const client = getClientForSkill(config, ref);
          if (!client) {
            log.warning(`No registry for ${ref}, skipping.`);
            continue;
          }

          try {
            await installSingleFromRegistry(parsed.author, parsed.name, skillsDir, client);
          } catch {
            log.warning(`Failed to install skill "${ref}", skipping.`);
          }
        }
      }
    }
  }

  await setActivePersona(name);
  log.success(`Active persona set to: ${name}`);
  log.info("Restart your MCP client to apply.");
}

async function personaDeactivateCommand(): Promise<void> {
  const config = await readConfig();
  if (!config.active_persona) {
    log.info("No active persona.");
    return;
  }

  const name = config.active_persona;
  await setActivePersona(null);
  log.success(`Deactivated persona "${name}".`);
  log.info("Restart your MCP client to apply.");
}

async function personaRemoveCommand(name?: string): Promise<void> {
  const { removePersona } = await import("./remove.js");

  if (name) {
    await removePersona(name);
    return;
  }

  const names = await selectPersonasInteractively();
  for (const n of names) {
    await removePersona(n);
  }
}

async function selectPersonasInteractively(): Promise<string[]> {
  const personas = await listPersonas();

  if (personas.length === 0) {
    exitError("No personas installed.");
  }

  const choices = await multiselect({
    message: "Select persona(s) to remove:",
    options: personas.map((p) => ({
      value: `${p.author}/${p.name}`,
      label: `${p.author}/${p.name}@${p.version}`,
    })),
    required: true,
  });

  if (isCancel(choices)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return choices as string[];
}

async function personaInfoCommand(name: string): Promise<void> {
  const persona = await readPersona(name);
  if (!persona) {
    exitError(`Persona "${name}" not found. Use \`spm persona list\` to see available personas.`);
  }

  const { frontmatter, body } = persona;
  const lines: string[] = [];
  lines.push(`description: ${frontmatter.description}`);
  lines.push(`author:      ${frontmatter.author}`);
  lines.push(`license:     ${frontmatter.license}`);

  if (frontmatter.skillbase?.settings) {
    lines.push("");
    lines.push("settings:");
    for (const [key, value] of Object.entries(frontmatter.skillbase.settings)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  const skills = frontmatter.skillbase?.skills;
  if (skills) {
    const deps = Object.entries(skills);
    if (deps.length > 0) {
      lines.push("");
      lines.push("dependencies:");
      for (const [dep, range] of deps) {
        lines.push(`  - ${dep}: ${range}`);
      }
    }
  }

  if (body) {
    lines.push("");
    lines.push("---");
    lines.push(body.slice(0, 500));
    if (body.length > 500) lines.push("...");
  }

  note(lines.join("\n"), `${frontmatter.author}/${frontmatter.name}@${frontmatter.version}`);
}

async function personaValidateCommand(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath);

  try {
    const raw = await fs.readFile(resolved, "utf-8");

    if (resolved.endsWith(".md")) {
      const parsed = parseSoul(raw);
      const result = validateSoulFrontmatter(parsed.frontmatter);
      if (result.valid) {
        log.success(`Valid SOUL.md: ${resolved}`);
      } else {
        exitError(`Invalid SOUL.md: ${resolved}\n${result.errors.map((e) => `  ${e}`).join("\n")}`);
      }
      return;
    }

    exitError(`Unsupported file format. Expected SOUL.md.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    exitError(`Failed to read/parse ${resolved}: ${message}`);
  }
}

// --- Export / Deploy helpers ---

function supportedTargetsList(): string {
  return getAllTargetIds().join(", ");
}

async function resolvePersonaSkills(
  persona: ParsedSoul,
): Promise<LoadedSkill[]> {
  const skills = persona.frontmatter.skillbase?.skills;
  if (!skills) return [];
  const index = await getSkillIndex();
  const loaded: LoadedSkill[] = [];

  for (const ref of Object.keys(skills)) {
    const entry = findSkill(index, ref);
    if (entry) {
      loaded.push(await loadSkill(entry));
    }
  }
  return loaded;
}

async function personaExportCommand(
  name: string,
  options: { format: string; output?: string; overwrite?: boolean },
): Promise<void> {
  const target = getTarget(options.format);
  if (!target) {
    exitError(
      `Unknown target format "${options.format}". Supported: ${supportedTargetsList()}`,
    );
  }

  const persona = await readPersona(name);
  if (!persona) {
    exitError(
      `Persona "${name}" not found. Use \`spm persona list\` to see available personas.`,
    );
  }

  const skills = await resolvePersonaSkills(persona);
  const outputDir = options.output ?? `./${persona.frontmatter.name}-${options.format}`;

  const result = await target.export(persona, skills, {
    outputDir: path.resolve(outputDir),
    overwrite: options.overwrite,
  });

  log.success(`Exported persona "${name}" to ${target.name} format.`);
  log.message(`Output: ${result.outputDir}`);
  for (const file of result.files) {
    log.message(`  ${file}`);
  }
}

async function personaDeployCommand(
  name: string,
  options: {
    target: string;
    agentId?: string;
    bindChannel?: string;
    bindAccount?: string;
    openclawConfig?: string;
    overwrite?: boolean;
  },
): Promise<void> {
  const target = getTarget(options.target);
  if (!target) {
    exitError(
      `Unknown target "${options.target}". Supported: ${supportedTargetsList()}`,
    );
  }

  const persona = await readPersona(name);
  if (!persona) {
    exitError(
      `Persona "${name}" not found. Use \`spm persona list\` to see available personas.`,
    );
  }

  const skills = await resolvePersonaSkills(persona);
  const agentId = options.agentId ?? persona.frontmatter.name;

  const result = await target.deploy(persona, skills, {
    agentId,
    bindChannel: options.bindChannel,
    bindAccountId: options.bindAccount,
    configPath: options.openclawConfig,
    overwrite: options.overwrite,
  });

  log.success(`Deployed persona "${name}" as agent "${result.agentId}".`);
  log.message(`Workspace: ${result.workspaceDir}`);

  if (result.configUpdated) {
    log.info("Updated openclaw.json");
  }
  if (result.bindingAdded) {
    log.info(`Binding added: ${options.bindChannel}`);
  }
  if (result.dockerFragment) {
    note(result.dockerFragment, "Docker users");
  }

  log.info("Run `openclaw gateway restart` to apply changes.");
}

async function personaImportCommand(options: {
  from: string;
  agentId?: string;
  workspace?: string;
  output?: string;
}): Promise<void> {
  const target = getTarget(options.from);
  if (!target) {
    exitError(
      `Unknown source "${options.from}". Supported: ${supportedTargetsList()}`,
    );
  }

  if (!target.import) {
    exitError(`Target "${options.from}" does not support import.`);
  }

  let workspacePath = options.workspace;

  if (!workspacePath && options.agentId) {
    const os = await import("node:os");
    const configPath = path.join(
      os.default.homedir(),
      ".openclaw",
      "openclaw.json",
    );
    try {
      const { parse: parseJsonc } = await import("jsonc-parser");
      const raw = await fs.readFile(configPath, "utf-8");
      const config = parseJsonc(raw) as Record<string, unknown>;
      const agents = config.agents as
        | { list: Array<{ id: string; workspace: string }> }
        | undefined;
      const agent = agents?.list?.find((a) => a.id === options.agentId);
      if (agent) {
        workspacePath = agent.workspace;
      }
    } catch { /* config not found */ }
  }

  if (!workspacePath) {
    exitError(
      "Provide --workspace or --agent-id to locate the source workspace.",
    );
  }

  const legacy = await target.import(path.resolve(workspacePath));

  const outputPath =
    options.output ?? path.resolve(`${legacy.name}.person.json`);
  await fs.writeFile(
    outputPath,
    JSON.stringify(legacy, null, 2) + "\n",
    "utf-8",
  );

  log.success(`Imported persona "${legacy.name}" from ${target.name}.`);
  log.message(`Output: ${outputPath}`);
}

// --- Command definition ---

export const command: CommandDef = {
  name: "persona",
  description: "Manage AI personas",
  group: "personas",
  subcommands: [
    {
      name: "create",
      description: "Create a new persona scaffold (SOUL.md)",
      group: "personas",
      args: [{ name: "name", required: true }],
      handler: personaCreateCommand,
    },
    {
      name: "list",
      description: "List installed personas",
      group: "personas",
      handler: personaListCommand,
    },
    {
      name: "activate",
      description: "Activate persona (auto-installs from registry if needed)",
      group: "personas",
      args: [{ name: "name", required: true }],
      handler: personaActivateCommand,
    },
    {
      name: "deactivate",
      description: "Deactivate current persona",
      group: "personas",
      handler: personaDeactivateCommand,
    },
    {
      name: "info",
      description: "Show detailed information about a persona",
      group: "personas",
      args: [{ name: "name", required: true }],
      handler: personaInfoCommand,
    },
    {
      name: "remove",
      description: "Remove a persona",
      group: "personas",
      args: [{ name: "name", required: false }],
      handler: personaRemoveCommand,
    },
    {
      name: "validate",
      description: "Validate a SOUL.md file",
      group: "personas",
      args: [{ name: "path", required: true }],
      handler: personaValidateCommand,
    },
    {
      name: "export",
      description: "Export persona to a target platform format",
      group: "personas",
      args: [{ name: "name", required: true }],
      options: [
        {
          flags: "-f, --format <format>",
          description: "Target format (e.g. openclaw)",
          required: true,
        },
        {
          flags: "-o, --output <dir>",
          description: "Output directory",
        },
        {
          flags: "--overwrite",
          description: "Overwrite existing files",
        },
      ],
      handler: personaExportCommand,
    },
    {
      name: "deploy",
      description: "Deploy persona to a target platform",
      group: "personas",
      args: [{ name: "name", required: true }],
      options: [
        {
          flags: "-t, --target <target>",
          description: "Target platform (e.g. openclaw)",
          required: true,
        },
        {
          flags: "-a, --agent-id <id>",
          description: "Agent ID on target platform (default: persona name)",
        },
        {
          flags: "-c, --bind-channel <channel>",
          description: "Channel to bind (e.g. telegram, whatsapp)",
        },
        {
          flags: "--bind-account <accountId>",
          description: "Account ID within channel",
        },
        {
          flags: "--openclaw-config <path>",
          description: "Path to openclaw.json",
        },
        {
          flags: "--overwrite",
          description: "Overwrite existing workspace",
        },
      ],
      handler: personaDeployCommand,
    },
    {
      name: "import",
      description: "Import persona from a target platform",
      group: "personas",
      options: [
        {
          flags: "--from <platform>",
          description: "Source platform (e.g. openclaw)",
          required: true,
        },
        {
          flags: "--agent-id <id>",
          description: "Agent ID to import from",
        },
        {
          flags: "--workspace <path>",
          description: "Direct path to workspace directory",
        },
        {
          flags: "-o, --output <path>",
          description: "Output path",
        },
      ],
      handler: personaImportCommand,
    },
  ],
};
