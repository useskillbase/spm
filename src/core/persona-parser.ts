import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type {
  ParsedSoul,
  SoulFrontmatter,
  LegacyPersonaManifest,
  SoulSkillbaseBlock,
} from "../types/index.js";

const REQUIRED_FIELDS = ["name", "version", "author", "license", "description"] as const;

export class SoulParseError extends Error {
  constructor(
    message: string,
    public readonly fields: string[] = [],
  ) {
    super(message);
    this.name = "SoulParseError";
  }
}

/**
 * Parse a SOUL.md string into frontmatter + body.
 */
export function parseSoul(content: string): ParsedSoul {
  const { data, content: body } = matter(content);

  const missing = REQUIRED_FIELDS.filter((f) => data[f] === undefined || data[f] === "");
  if (missing.length > 0) {
    throw new SoulParseError(
      `SOUL.md missing required fields: ${missing.join(", ")}`,
      missing as unknown as string[],
    );
  }

  return {
    frontmatter: data as SoulFrontmatter,
    body: body.trim(),
  };
}

/**
 * Parse a SOUL.md file from disk. Supports legacy .person.json fallback.
 */
export async function parseSoulFile(filePath: string): Promise<ParsedSoul> {
  const dir = path.dirname(filePath);
  const filename = path.basename(filePath);

  // If given a .person.json path directly
  if (filename.endsWith(".person.json")) {
    return parseLegacyPersona(filePath);
  }

  // Check for legacy format in the same directory
  const personaName = path.basename(dir);
  const legacyPath = path.join(dir, `${personaName}.person.json`);
  try {
    await fs.access(legacyPath);
    return parseLegacyPersona(legacyPath);
  } catch {
    // New format
  }

  const raw = await fs.readFile(filePath, "utf-8");
  return parseSoul(raw);
}

/**
 * Convert a legacy .person.json to ParsedSoul.
 */
async function parseLegacyPersona(jsonPath: string): Promise<ParsedSoul> {
  const raw = await fs.readFile(jsonPath, "utf-8");
  const manifest = JSON.parse(raw) as LegacyPersonaManifest;
  return {
    frontmatter: legacyPersonaToSoul(manifest),
    body: buildLegacyBody(manifest),
  };
}

/**
 * Convert a legacy PersonaManifest to SoulFrontmatter.
 */
export function legacyPersonaToSoul(manifest: LegacyPersonaManifest): SoulFrontmatter {
  const soul: SoulFrontmatter = {
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    license: manifest.license,
    description: manifest.description,
  };

  const skillbase: SoulSkillbaseBlock = {
    schema_version: 3,
  };

  if (manifest.skills && Object.keys(manifest.skills).length > 0) {
    skillbase.skills = manifest.skills;
  }

  if (manifest.settings) {
    skillbase.settings = manifest.settings;
  }

  soul.skillbase = skillbase;
  return soul;
}

/**
 * Build markdown body from legacy persona character fields.
 */
function buildLegacyBody(manifest: LegacyPersonaManifest): string {
  const parts: string[] = [];

  parts.push(`## Role\n\n${manifest.character.role}`);

  if (manifest.character.tone) {
    parts.push(`## Tone\n\n${manifest.character.tone}`);
  }

  if (manifest.character.guidelines && manifest.character.guidelines.length > 0) {
    const items = manifest.character.guidelines.map((g) => `- ${g}`).join("\n");
    parts.push(`## Guidelines\n\n${items}`);
  }

  if (manifest.character.instructions) {
    parts.push(`## Instructions\n\n${manifest.character.instructions}`);
  }

  return parts.join("\n\n");
}

/**
 * Serialize a ParsedSoul back to SOUL.md string.
 */
export function serializeSoul(soul: ParsedSoul): string {
  return matter.stringify(soul.body, soul.frontmatter);
}

/**
 * Replace {{PLACEHOLDER}} tokens in body with provided values.
 */
export function resolveContextSlots(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return values[key] ?? match;
  });
}
