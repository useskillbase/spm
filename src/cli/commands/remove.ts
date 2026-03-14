import fs from "node:fs/promises";
import path from "node:path";
import { uninstallCommand } from "./uninstall.js";
import {
  getGlobalSkillsDir,
  getProjectSkillsDir,
  getPersonaPath,
} from "../../core/paths.js";
import { readConfig } from "../../core/config.js";
import { setActivePersona } from "../../core/persona.js";
import { validatePersonaManifest } from "../../schema/persona-schema.js";
import type { PersonaManifest } from "../../types/index.js";
import { log, multiselect, isCancel, cancel, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "remove",
  description: "Remove a skill or skill reference from persona",
  group: "manage",
  aliases: ["rm"],
  args: [{ name: "name", required: true }],
  options: [
    { flags: "--from [persona]", description: "Remove skill reference from persona file(s)" },
  ],
  handler: removeCommand,
};

async function removeFromPersona(skillRef: string, personaName: string): Promise<void> {
  const fileName = `${personaName}.person.json`;
  const filePath = path.resolve(fileName);

  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch {
    exitError(`"${fileName}" not found in current directory.`);
  }

  let persona: PersonaManifest;
  try {
    persona = JSON.parse(raw) as PersonaManifest;
  } catch {
    exitError(`Failed to parse "${fileName}".`);
  }

  const validation = validatePersonaManifest(persona);
  if (!validation.valid) {
    exitError(`Invalid persona manifest.\n${validation.errors.map((e) => `  ${e}`).join("\n")}`);
  }

  if (!persona.skills || !(skillRef in persona.skills)) {
    exitError(`Skill "${skillRef}" not found in persona "${personaName}".`);
  }

  delete persona.skills[skillRef];

  await fs.writeFile(filePath, JSON.stringify(persona, null, 2) + "\n", "utf-8");
  log.success(`Removed "${skillRef}" from ${fileName}.`);
}

async function removePersona(name: string): Promise<void> {
  const globalDir = getGlobalSkillsDir();
  const projectDir = getProjectSkillsDir(process.cwd());

  let personaPath: string | null = null;
  for (const dir of [projectDir, globalDir]) {
    const candidate = getPersonaPath(dir, name);
    try {
      await fs.access(candidate);
      personaPath = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!personaPath) {
    exitError(`Persona "${name}" is not installed.`);
  }

  const config = await readConfig();
  if (config.active_persona === name) {
    await setActivePersona(null);
    log.info(`Cleared active persona (was "${name}").`);
  }

  await fs.rm(personaPath);
  log.success(`Removed persona "${name}".`);
}

async function findPersonaFiles(): Promise<string[]> {
  const cwd = process.cwd();
  const entries = await fs.readdir(cwd, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".person.json"))
    .map((e) => e.name);
}

async function removeFromPersonas(skillRef: string, fromArg?: string): Promise<void> {
  if (fromArg) {
    const names = fromArg.split(",").map((n) => n.trim());
    for (const name of names) {
      await removeFromPersona(skillRef, name);
    }
    return;
  }

  // Interactive: find .person.json files in cwd
  const files = await findPersonaFiles();
  if (files.length === 0) {
    exitError("No .person.json files found in current directory. Specify --from <persona>.");
  }

  if (files.length === 1) {
    const name = files[0].replace(".person.json", "");
    await removeFromPersona(skillRef, name);
    return;
  }

  const choices = await multiselect({
    message: "Remove from which persona(s)?",
    options: files.map((f) => ({
      value: f.replace(".person.json", ""),
      label: f,
    })),
    required: true,
  });

  if (isCancel(choices)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  for (const name of choices as string[]) {
    await removeFromPersona(skillRef, name);
  }
}

export async function removeCommand(
  name: string,
  options: { from?: string | boolean },
): Promise<void> {
  // --from: remove skill ref from persona file(s)
  if (options.from !== undefined) {
    const fromArg = typeof options.from === "string" ? options.from : undefined;
    await removeFromPersonas(name, fromArg);
    return;
  }

  // Default: uninstall skill
  await uninstallCommand(name);
}

export { removePersona };
