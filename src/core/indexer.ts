import fs from "node:fs/promises";
import path from "node:path";
import { getInstalledDir, getIndexPath } from "./paths.js";
import { validateSkillManifest } from "../schema/skill-schema.js";
import type { SkillManifest, SkillIndex, IndexSkillEntry } from "../types/index.js";

async function estimateTokens(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    // Rough estimate: ~4 chars per token for English text
    return Math.ceil(content.length / 4);
  } catch {
    return 0;
  }
}

async function readSkillManifest(skillDir: string): Promise<SkillManifest | null> {
  const manifestPath = path.join(skillDir, "skill.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    const result = validateSkillManifest(data);
    if (!result.valid) {
      console.error(`Invalid skill.json in ${skillDir}:`, result.errors);
      return null;
    }
    return data as SkillManifest;
  } catch (err) {
    console.error(`Failed to read skill.json in ${skillDir}:`, err);
    return null;
  }
}

export async function buildIndex(skillsDir: string): Promise<SkillIndex> {
  const installedDir = getInstalledDir(skillsDir);
  const index: SkillIndex = { version: "1.0.0", skills: [] };

  let scopes: string[];
  try {
    scopes = await fs.readdir(installedDir);
  } catch {
    return index;
  }

  for (const author of scopes) {
    const authorDir = path.join(installedDir, author);
    const stat = await fs.stat(authorDir);
    if (!stat.isDirectory()) continue;

    const skillNames = await fs.readdir(authorDir);
    for (const skillName of skillNames) {
      const skillDir = path.join(authorDir, skillName);
      const skillStat = await fs.stat(skillDir);
      if (!skillStat.isDirectory()) continue;

      const manifest = await readSkillManifest(skillDir);
      if (!manifest) continue;

      // Skip bundles (no entry or trigger = not a loadable skill)
      if (!manifest.entry || !manifest.trigger) continue;

      const entryPath = path.join(skillDir, manifest.entry);
      const tokensEstimate = await estimateTokens(entryPath);

      const entry: IndexSkillEntry = {
        name: manifest.name,
        v: manifest.version,
        trigger: manifest.trigger.description,
        tags: manifest.trigger.tags,
        priority: manifest.trigger.priority,
        entry: entryPath,
        tokens_estimate: tokensEstimate,
      };

      if (manifest.trigger.file_patterns) {
        entry.file_patterns = manifest.trigger.file_patterns;
      }
      if (manifest.compact_entry) {
        entry.compact_entry = path.join(skillDir, manifest.compact_entry);
      }

      index.skills.push(entry);
    }
  }

  // Sort by priority descending
  index.skills.sort((a, b) => b.priority - a.priority);
  return index;
}

export async function writeIndex(skillsDir: string): Promise<SkillIndex> {
  const index = await buildIndex(skillsDir);
  const indexPath = getIndexPath(skillsDir);
  await fs.mkdir(skillsDir, { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
  return index;
}
