import fs from "node:fs/promises";
import path from "node:path";
import {
  getGlobalSkillsDir,
  getProjectSkillsDir,
  getInstalledDir,
  getSoulMdPath,
} from "./paths.js";
import { readConfig, writeConfig } from "./config.js";
import { parseSoul, serializeSoul } from "./persona-parser.js";
import { validateSoulFrontmatter } from "../schema/persona-schema.js";
import type { ParsedSoul } from "../types/index.js";

export interface PersonaListEntry {
  name: string;
  author: string;
  version: string;
  description: string;
  dependencies_count: number;
}

async function scanPersonas(
  skillsDir: string,
): Promise<ParsedSoul[]> {
  const installedDir = getInstalledDir(skillsDir);
  const personas: ParsedSoul[] = [];

  try {
    const authorDirs = await fs.readdir(installedDir, { withFileTypes: true });

    for (const authorEntry of authorDirs) {
      if (!authorEntry.isDirectory()) continue;

      const authorPath = path.join(installedDir, authorEntry.name);
      const packageDirs = await fs.readdir(authorPath, { withFileTypes: true });

      for (const pkgEntry of packageDirs) {
        if (!pkgEntry.isDirectory()) continue;

        const soulPath = path.join(authorPath, pkgEntry.name, "SOUL.md");
        try {
          const raw = await fs.readFile(soulPath, "utf-8");
          personas.push(parseSoul(raw));
        } catch {
          // Not a persona or invalid — skip
        }
      }
    }
  } catch {
    // installed dir doesn't exist
  }

  return personas;
}

export async function listPersonas(
  cwd?: string,
): Promise<PersonaListEntry[]> {
  const workdir = cwd ?? process.cwd();
  const globalDir = getGlobalSkillsDir();
  const projectDir = getProjectSkillsDir(workdir);

  const [globalPersonas, projectPersonas] = await Promise.all([
    scanPersonas(globalDir),
    scanPersonas(projectDir),
  ]);

  const key = (p: ParsedSoul) => `${p.frontmatter.author}/${p.frontmatter.name}`;
  const map = new Map<string, ParsedSoul>();
  for (const p of globalPersonas) map.set(key(p), p);
  for (const p of projectPersonas) map.set(key(p), p);

  return Array.from(map.values()).map((p) => ({
    name: p.frontmatter.name,
    author: p.frontmatter.author,
    version: p.frontmatter.version,
    description: p.frontmatter.description,
    dependencies_count: p.frontmatter.skillbase?.skills
      ? Object.keys(p.frontmatter.skillbase.skills).length
      : 0,
  }));
}

export async function readPersona(
  ref: string,
  cwd?: string,
): Promise<ParsedSoul | null> {
  const workdir = cwd ?? process.cwd();
  const projectDir = getProjectSkillsDir(workdir);
  const globalDir = getGlobalSkillsDir();

  const slashIdx = ref.indexOf("/");

  // Qualified ref: author/name — direct lookup
  if (slashIdx !== -1) {
    const author = ref.slice(0, slashIdx);
    const name = ref.slice(slashIdx + 1);

    for (const dir of [projectDir, globalDir]) {
      const soulPath = getSoulMdPath(dir, author, name);
      try {
        const raw = await fs.readFile(soulPath, "utf-8");
        return parseSoul(raw);
      } catch { /* not found */ }
    }
    return null;
  }

  // Short name: search by persona name across all authors
  for (const dir of [projectDir, globalDir]) {
    const installedDir = getInstalledDir(dir);
    try {
      const authorDirs = await fs.readdir(installedDir, { withFileTypes: true });
      for (const authorEntry of authorDirs) {
        if (!authorEntry.isDirectory()) continue;
        const soulPath = getSoulMdPath(dir, authorEntry.name, ref);
        try {
          const raw = await fs.readFile(soulPath, "utf-8");
          return parseSoul(raw);
        } catch { /* not found */ }
      }
    } catch { /* installed dir doesn't exist */ }
  }

  return null;
}

export async function installPersona(
  sourcePath: string,
  options?: { global?: boolean; cwd?: string },
): Promise<ParsedSoul> {
  const raw = await fs.readFile(sourcePath, "utf-8");
  const parsed = parseSoul(raw);

  const validation = validateSoulFrontmatter(parsed.frontmatter);
  if (!validation.valid) {
    throw new Error(
      `Invalid SOUL.md:\n${validation.errors.join("\n")}`,
    );
  }

  const skillsDir =
    options?.global !== false
      ? getGlobalSkillsDir()
      : getProjectSkillsDir(options?.cwd ?? process.cwd());

  const { author, name } = parsed.frontmatter;
  const destPath = getSoulMdPath(skillsDir, author, name);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, serializeSoul(parsed), "utf-8");

  return parsed;
}

export async function getActivePersona(
  cwd?: string,
): Promise<ParsedSoul | null> {
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
  soul: ParsedSoul,
): string {
  const parts: string[] = [];
  const { frontmatter, body } = soul;
  const settings = frontmatter.skillbase?.settings;

  parts.push(`## Persona\n\n${body}`);

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
