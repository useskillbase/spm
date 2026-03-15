import fs from "node:fs/promises";
import path from "node:path";
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
import { validatePersonaManifest } from "../../schema/persona-schema.js";
import { installSingleFromRegistry, resolveSkillsDir } from "./add.js";
import { getTarget, getAllTargetIds } from "../../targets/index.js";
import type { PersonaManifest, LoadedSkill } from "../../types/index.js";
import { log, spinner, note, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

function parseSkillRef(ref: string): { author: string; name: string } | null {
  const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (!match) return null;
  return { author: match[1], name: match[2] };
}

function buildPersonaTemplate(name: string): PersonaManifest {
  return {
    schema_version: 1,
    name,
    version: "1.0.0",
    description: `TODO: describe ${name} persona`,
    author: "TODO",
    license: "MIT",
    skills: {},
    character: {
      role: "TODO: describe the persona's role and expertise.",
      tone: "TODO: e.g. professional, friendly, concise",
      guidelines: [
        "TODO: add behavioral guidelines",
      ],
    },
  };
}

// --- Handlers ---

async function personaCreateCommand(name: string): Promise<void> {
  const fileName = `${name}.person.json`;
  const filePath = path.resolve(fileName);

  try {
    await fs.access(filePath);
    exitError(`File "${fileName}" already exists.`);
  } catch {
    // File doesn't exist — good
  }

  const template = buildPersonaTemplate(name);
  await fs.writeFile(filePath, JSON.stringify(template, null, 2) + "\n", "utf-8");

  log.success(`Created persona scaffold: ${fileName}`);
  note(
    `1. Edit ${fileName} — set character and settings\n2. spm add <author/skill> --for ${name}\n3. spm persona activate ${name}`,
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
    const active = config.active_persona === p.name ? " (active)" : "";
    log.message(
      `${p.name}@${p.version}${active} — ${p.description} [${p.dependencies_count} skills]`,
    );
  }
}

async function personaActivateCommand(name: string): Promise<void> {
  // First try to find installed persona
  let persona = await readPersona(name);

  // If not installed, try to install from .person.json in cwd
  if (!persona) {
    const fileName = `${name}.person.json`;
    const filePath = path.resolve(fileName);
    try {
      await fs.access(filePath);
      const installed = await installPersona(filePath, { global: true });
      persona = installed;
      log.success(`Installed persona from ${fileName}`);
    } catch {
      exitError(`Persona "${name}" not found. Use \`spm persona list\` or create one with \`spm persona create ${name}\`.`);
    }
  }

  // Auto-install missing skills
  if (persona.skills) {
    const skillRefs = Object.keys(persona.skills);
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

async function personaRemoveCommand(name: string): Promise<void> {
  const { removePersona } = await import("./remove.js");
  await removePersona(name);
}

async function personaInfoCommand(name: string): Promise<void> {
  const persona = await readPersona(name);
  if (!persona) {
    exitError(`Persona "${name}" not found. Use \`spm persona list\` to see available personas.`);
  }

  const lines: string[] = [];
  lines.push(`description: ${persona.description}`);
  lines.push(`author:      ${persona.author}`);
  lines.push(`license:     ${persona.license}`);
  lines.push("");
  lines.push("character:");
  lines.push(`  role: ${persona.character.role}`);
  if (persona.character.tone) {
    lines.push(`  tone: ${persona.character.tone}`);
  }
  if (persona.character.guidelines && persona.character.guidelines.length > 0) {
    lines.push("  guidelines:");
    for (const g of persona.character.guidelines) {
      lines.push(`    - ${g}`);
    }
  }
  if (persona.character.instructions) {
    lines.push(`  instructions: ${persona.character.instructions}`);
  }

  if (persona.settings) {
    lines.push("");
    lines.push("settings:");
    for (const [key, value] of Object.entries(persona.settings)) {
      if (value !== undefined) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  if (persona.skills) {
    const deps = Object.entries(persona.skills);
    if (deps.length > 0) {
      lines.push("");
      lines.push("dependencies:");
      for (const [dep, range] of deps) {
        lines.push(`  - ${dep}: ${range}`);
      }
    }
  }

  note(lines.join("\n"), `${persona.name}@${persona.version}`);
}

async function personaValidateCommand(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath);

  try {
    const raw = await fs.readFile(resolved, "utf-8");
    const data = JSON.parse(raw);
    const result = validatePersonaManifest(data);

    if (result.valid) {
      log.success(`Valid persona manifest: ${resolved}`);
    } else {
      exitError(`Invalid persona manifest: ${resolved}\n${result.errors.map((e) => `  ${e}`).join("\n")}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    exitError(`Failed to read/parse ${resolved}: ${message}`);
  }
}

// --- Export / Deploy / Import helpers ---

function supportedTargetsList(): string {
  return getAllTargetIds().join(", ");
}

async function resolvePersonaSkills(
  persona: PersonaManifest,
): Promise<LoadedSkill[]> {
  if (!persona.skills) return [];
  const index = await getSkillIndex();
  const loaded: LoadedSkill[] = [];

  for (const ref of Object.keys(persona.skills)) {
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
  const outputDir = options.output ?? `./${name}-${options.format}`;

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
  const agentId = options.agentId ?? name;

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

  // Resolve workspace from agent ID via openclaw.json
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
    } catch {
      // Config not found
    }
  }

  if (!workspacePath) {
    exitError(
      "Provide --workspace or --agent-id to locate the source workspace.",
    );
  }

  const persona = await target.import(path.resolve(workspacePath));

  const outputPath =
    options.output ?? path.resolve(`${persona.name}.person.json`);
  await fs.writeFile(
    outputPath,
    JSON.stringify(persona, null, 2) + "\n",
    "utf-8",
  );

  log.success(`Imported persona "${persona.name}" from ${target.name}.`);
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
      description: "Create a new persona scaffold (.person.json)",
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
      description: "Activate persona (auto-installs missing skills)",
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
      description: "Remove a persona from global installation",
      group: "personas",
      args: [{ name: "name", required: true }],
      handler: personaRemoveCommand,
    },
    {
      name: "validate",
      description: "Validate a .person.json file",
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
          description: "Output .person.json path",
        },
      ],
      handler: personaImportCommand,
    },
  ],
};
