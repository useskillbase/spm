import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { serializeSkill } from "./skill-parser.js";
import type { SkillFrontmatter } from "../types/index.js";
import { legacyPersonaToSoul, serializeSoul } from "./persona-parser.js";
import type {
  LegacySkillManifest,
  LegacyPersonaManifest,
  WorkspaceManifest,
} from "../types/index.js";

export interface MigrateResult {
  action: "created" | "skipped" | "error";
  source: string;
  target: string;
  backup?: string;
  error?: string;
}

function legacyToFrontmatter(manifest: LegacySkillManifest): SkillFrontmatter {
  const fm: SkillFrontmatter = {
    schema_version: 3,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    license: manifest.license,
    description: manifest.description,
  };
  if (manifest.language) fm.language = manifest.language;
  if (manifest.trigger) fm.trigger = manifest.trigger;
  if (manifest.security) {
    fm.security = { permissions: manifest.security.permissions };
    if (manifest.security.file_scope) fm.security.file_scope = manifest.security.file_scope;
  }
  if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
    fm.dependencies = manifest.dependencies;
  }
  if (manifest.compatibility) fm.compatibility = manifest.compatibility;
  if (manifest.works_with) fm.works_with = manifest.works_with;
  if (manifest.docs) fm.docs = manifest.docs;
  if (manifest.repository) fm.repository = manifest.repository;
  return fm;
}

/**
 * Migrate a skill directory from skill.json + SKILL.md → unified SKILL.md.
 */
export async function migrateSkill(
  skillDir: string,
  dryRun: boolean = false,
): Promise<MigrateResult> {
  const manifestPath = path.join(skillDir, "skill.json");
  const skillMdPath = path.join(skillDir, "SKILL.md");

  // Check if already migrated (SKILL.md with frontmatter, no skill.json)
  try {
    await fs.access(skillMdPath);
    const content = await fs.readFile(skillMdPath, "utf-8");
    const { data } = matter(content);
    if (data.schema_version && !await fileExists(manifestPath)) {
      return { action: "skipped", source: skillDir, target: skillMdPath };
    }
  } catch { /* no SKILL.md yet */ }

  // Must have skill.json to migrate
  let manifestRaw: string;
  try {
    manifestRaw = await fs.readFile(manifestPath, "utf-8");
  } catch {
    return {
      action: "error",
      source: skillDir,
      target: skillMdPath,
      error: "No skill.json found",
    };
  }

  let manifest: LegacySkillManifest;
  try {
    manifest = JSON.parse(manifestRaw) as LegacySkillManifest;
  } catch (err) {
    return {
      action: "error",
      source: skillDir,
      target: skillMdPath,
      error: `Invalid skill.json: ${err}`,
    };
  }

  // Read existing SKILL.md body if present
  let body = "";
  try {
    const existing = await fs.readFile(skillMdPath, "utf-8");
    const parsed = matter(existing);
    body = parsed.content.trim();
  } catch { /* no body */ }

  // Build unified SKILL.md
  const frontmatter = legacyToFrontmatter(manifest);
  const unified = serializeSkill({ frontmatter, body });

  if (dryRun) {
    return { action: "created", source: manifestPath, target: skillMdPath };
  }

  // Backup skill.json
  const backupPath = manifestPath + ".bak";
  await fs.copyFile(manifestPath, backupPath);

  // Write unified SKILL.md
  await fs.writeFile(skillMdPath, unified, "utf-8");

  // Remove old skill.json
  await fs.unlink(manifestPath);

  // Remove compact files if they exist
  if (manifest.compact_entry) {
    const compactPath = path.join(skillDir, manifest.compact_entry);
    try {
      await fs.unlink(compactPath);
    } catch { /* doesn't exist */ }
  }

  return {
    action: "created",
    source: manifestPath,
    target: skillMdPath,
    backup: backupPath,
  };
}

/**
 * Migrate a persona from .person.json → SOUL.md.
 */
export async function migratePersona(
  personaPath: string,
  dryRun: boolean = false,
): Promise<MigrateResult> {
  const dir = path.dirname(personaPath);
  const soulMdPath = path.join(dir, "SOUL.md");

  // If given a directory, find .person.json inside
  let jsonPath = personaPath;
  try {
    const stat = await fs.stat(personaPath);
    if (stat.isDirectory()) {
      const files = await fs.readdir(personaPath);
      const personFile = files.find((f) => f.endsWith(".person.json"));
      if (!personFile) {
        // Check if SOUL.md already exists
        if (files.includes("SOUL.md")) {
          return { action: "skipped", source: personaPath, target: soulMdPath };
        }
        return {
          action: "error",
          source: personaPath,
          target: soulMdPath,
          error: "No .person.json found in directory",
        };
      }
      jsonPath = path.join(personaPath, personFile);
    }
  } catch {
    return {
      action: "error",
      source: personaPath,
      target: soulMdPath,
      error: "Path not accessible",
    };
  }

  let raw: string;
  try {
    raw = await fs.readFile(jsonPath, "utf-8");
  } catch {
    return {
      action: "error",
      source: jsonPath,
      target: soulMdPath,
      error: "Cannot read .person.json",
    };
  }

  let manifest: LegacyPersonaManifest;
  try {
    manifest = JSON.parse(raw) as LegacyPersonaManifest;
  } catch (err) {
    return {
      action: "error",
      source: jsonPath,
      target: soulMdPath,
      error: `Invalid JSON: ${err}`,
    };
  }

  const frontmatter = legacyPersonaToSoul(manifest);

  // Build body from character fields
  const bodyParts: string[] = [];
  bodyParts.push(`## Role\n\n${manifest.character.role}`);
  if (manifest.character.tone) {
    bodyParts.push(`## Tone\n\n${manifest.character.tone}`);
  }
  if (manifest.character.guidelines?.length) {
    bodyParts.push(`## Guidelines\n\n${manifest.character.guidelines.map((g) => `- ${g}`).join("\n")}`);
  }
  if (manifest.character.instructions) {
    bodyParts.push(`## Instructions\n\n${manifest.character.instructions}`);
  }

  const body = bodyParts.join("\n\n");
  const soulContent = serializeSoul({ frontmatter, body });

  const targetPath = path.join(path.dirname(jsonPath), "SOUL.md");

  if (dryRun) {
    return { action: "created", source: jsonPath, target: targetPath };
  }

  // Backup
  const backupPath = jsonPath + ".bak";
  await fs.copyFile(jsonPath, backupPath);

  // Write SOUL.md
  await fs.writeFile(targetPath, soulContent, "utf-8");

  // Remove old .person.json
  await fs.unlink(jsonPath);

  return {
    action: "created",
    source: jsonPath,
    target: targetPath,
    backup: backupPath,
  };
}

/**
 * Migrate workspace manifest from skill.json → skillbase.json.
 */
export async function migrateWorkspace(
  cwd: string,
  dryRun: boolean = false,
): Promise<MigrateResult> {
  const legacyPath = path.join(cwd, "skill.json");
  const newPath = path.join(cwd, "skillbase.json");

  // Already migrated?
  if (await fileExists(newPath)) {
    return { action: "skipped", source: legacyPath, target: newPath };
  }

  let raw: string;
  try {
    raw = await fs.readFile(legacyPath, "utf-8");
  } catch {
    return {
      action: "error",
      source: legacyPath,
      target: newPath,
      error: "No skill.json found at project root",
    };
  }

  let legacy: LegacySkillManifest;
  try {
    legacy = JSON.parse(raw) as LegacySkillManifest;
  } catch (err) {
    return {
      action: "error",
      source: legacyPath,
      target: newPath,
      error: `Invalid JSON: ${err}`,
    };
  }

  // If it has an entry field, it's a skill manifest, not a workspace manifest
  if (legacy.entry) {
    return {
      action: "error",
      source: legacyPath,
      target: newPath,
      error: "skill.json has an 'entry' field — this is a skill manifest, not a workspace manifest. Use 'spm migrate skill' instead.",
    };
  }

  const workspace: WorkspaceManifest = {
    schema_version: 1,
    name: legacy.name,
    version: legacy.version,
    skills: legacy.dependencies ?? {},
    personas: {},
  };

  if (dryRun) {
    return { action: "created", source: legacyPath, target: newPath };
  }

  // Backup
  const backupPath = legacyPath + ".bak";
  await fs.copyFile(legacyPath, backupPath);

  // Write skillbase.json
  await fs.writeFile(newPath, JSON.stringify(workspace, null, 2) + "\n", "utf-8");

  // Remove old skill.json
  await fs.unlink(legacyPath);

  return {
    action: "created",
    source: legacyPath,
    target: newPath,
    backup: backupPath,
  };
}

/**
 * Migrate all: skills, personas, and workspace in a directory tree.
 */
export async function migrateAll(
  rootDir: string,
  dryRun: boolean = false,
): Promise<MigrateResult[]> {
  const results: MigrateResult[] = [];

  // Workspace manifest
  if (await fileExists(path.join(rootDir, "skill.json"))) {
    const raw = await fs.readFile(path.join(rootDir, "skill.json"), "utf-8");
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (!data.entry) {
        results.push(await migrateWorkspace(rootDir, dryRun));
      }
    } catch { /* skip invalid */ }
  }

  // Scan for skill directories (have skill.json with entry field)
  await scanDirectory(rootDir, async (dir) => {
    const manifestPath = path.join(dir, "skill.json");
    if (!await fileExists(manifestPath)) return;

    try {
      const raw = await fs.readFile(manifestPath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (data.entry || data.trigger) {
        results.push(await migrateSkill(dir, dryRun));
      }
    } catch { /* skip */ }
  });

  // Scan for persona files
  await scanDirectory(rootDir, async (dir) => {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.endsWith(".person.json")) {
          results.push(await migratePersona(path.join(dir, file), dryRun));
        }
      }
    } catch { /* skip */ }
  });

  return results;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function scanDirectory(
  dir: string,
  callback: (dir: string) => Promise<void>,
  maxDepth: number = 5,
  currentDepth: number = 0,
): Promise<void> {
  if (currentDepth > maxDepth) return;

  await callback(dir);

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      await scanDirectory(path.join(dir, entry.name), callback, maxDepth, currentDepth + 1);
    }
  } catch { /* permission denied or similar */ }
}
