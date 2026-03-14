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
import { validatePersonaManifest } from "../../schema/persona-schema.js";
import { installSingleFromRegistry, resolveSkillsDir } from "./add.js";
import type { PersonaManifest } from "../../types/index.js";
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
  ],
};
