import fs from "node:fs/promises";
import path from "node:path";
import {
  getGlobalSkillsDir,
  getProjectSkillsDir,
  getPersonasDir,
  getPersonaPath,
} from "./paths.js";
import { readConfig, writeConfig } from "./config.js";
import { validatePersonaManifest } from "../schema/persona-schema.js";
import type {
  PersonaManifest,
  PersonaCharacter,
  PersonaSettings,
} from "../types/index.js";

export interface PersonaListEntry {
  name: string;
  version: string;
  description: string;
  dependencies_count: number;
}

async function scanPersonasDir(
  skillsDir: string,
): Promise<PersonaManifest[]> {
  const dir = getPersonasDir(skillsDir);
  try {
    const files = await fs.readdir(dir);
    const personas: PersonaManifest[] = [];
    for (const file of files) {
      if (!file.endsWith(".person.json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const data = JSON.parse(raw) as PersonaManifest;
        personas.push(data);
      } catch {
        // skip invalid files
      }
    }
    return personas;
  } catch {
    return [];
  }
}

export async function listPersonas(
  cwd?: string,
): Promise<PersonaListEntry[]> {
  const workdir = cwd ?? process.cwd();
  const globalDir = getGlobalSkillsDir();
  const projectDir = getProjectSkillsDir(workdir);

  const [globalPersonas, projectPersonas] = await Promise.all([
    scanPersonasDir(globalDir),
    scanPersonasDir(projectDir),
  ]);

  // Project overrides global by name
  const map = new Map<string, PersonaManifest>();
  for (const p of globalPersonas) map.set(p.name, p);
  for (const p of projectPersonas) map.set(p.name, p);

  return Array.from(map.values()).map((p) => ({
    name: p.name,
    version: p.version,
    description: p.description,
    dependencies_count: p.skills
      ? Object.keys(p.skills).length
      : 0,
  }));
}

export async function readPersona(
  name: string,
  cwd?: string,
): Promise<PersonaManifest | null> {
  const workdir = cwd ?? process.cwd();
  const projectDir = getProjectSkillsDir(workdir);
  const globalDir = getGlobalSkillsDir();

  // Project first, then global
  for (const dir of [projectDir, globalDir]) {
    const filePath = getPersonaPath(dir, name);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as PersonaManifest;
    } catch {
      continue;
    }
  }
  return null;
}

export async function installPersona(
  sourcePath: string,
  options?: { global?: boolean; cwd?: string },
): Promise<PersonaManifest> {
  const raw = await fs.readFile(sourcePath, "utf-8");
  const data = JSON.parse(raw) as PersonaManifest;

  const validation = validatePersonaManifest(data);
  if (!validation.valid) {
    throw new Error(
      `Invalid persona manifest:\n${validation.errors.join("\n")}`,
    );
  }

  const skillsDir =
    options?.global !== false
      ? getGlobalSkillsDir()
      : getProjectSkillsDir(options?.cwd ?? process.cwd());

  const personasDir = getPersonasDir(skillsDir);
  await fs.mkdir(personasDir, { recursive: true });

  const destPath = getPersonaPath(skillsDir, data.name);
  await fs.writeFile(destPath, JSON.stringify(data, null, 2) + "\n", "utf-8");

  return data;
}

export async function getActivePersona(
  cwd?: string,
): Promise<PersonaManifest | null> {
  const config = await readConfig();
  if (!config.active_persona) return null;
  return readPersona(config.active_persona, cwd);
}

export async function setActivePersona(
  name: string | null,
): Promise<void> {
  const config = await readConfig();
  config.active_persona = name;
  await writeConfig(config);
}

export function buildCharacterInstructions(
  character: PersonaCharacter,
  settings?: PersonaSettings,
): string {
  const parts: string[] = [];

  parts.push(`## Persona\n\n${character.role}`);

  if (character.tone) {
    parts.push(`**Tone:** ${character.tone}`);
  }

  if (character.guidelines && character.guidelines.length > 0) {
    parts.push(
      `**Guidelines:**\n${character.guidelines.map((g) => `- ${g}`).join("\n")}`,
    );
  }

  if (character.instructions) {
    parts.push(character.instructions);
  }

  if (settings?.temperature !== undefined) {
    if (settings.temperature <= 0.3) {
      parts.push(
        "**Style note:** Be precise, factual, and conservative in your responses.",
      );
    } else if (settings.temperature >= 0.8) {
      parts.push(
        "**Style note:** Be creative, exploratory, and open to unconventional approaches.",
      );
    }
  }

  return parts.join("\n\n");
}
