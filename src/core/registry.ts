import fs from "node:fs/promises";
import { getGlobalSkillsDir, getProjectSkillsDir, getIndexPath } from "./paths.js";
import type { SkillIndex, IndexSkillEntry } from "../types/index.js";

async function readIndex(skillsDir: string): Promise<SkillIndex | null> {
  const indexPath = getIndexPath(skillsDir);
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(raw) as SkillIndex;
  } catch {
    return null;
  }
}

export interface RegistryOptions {
  cwd?: string;
}

/**
 * Reads and merges skill indexes from project-level and global directories.
 * Project skills override global ones by name.
 */
export async function getSkillIndex(options: RegistryOptions = {}): Promise<SkillIndex> {
  const cwd = options.cwd ?? process.cwd();
  const globalDir = getGlobalSkillsDir();
  const projectDir = getProjectSkillsDir(cwd);

  const [globalIndex, projectIndex] = await Promise.all([
    readIndex(globalDir),
    readIndex(projectDir),
  ]);

  const skillMap = new Map<string, IndexSkillEntry>();

  // Global first — project overrides
  if (globalIndex) {
    for (const skill of globalIndex.skills) {
      skillMap.set(skill.name, skill);
    }
  }
  if (projectIndex) {
    for (const skill of projectIndex.skills) {
      skillMap.set(skill.name, skill);
    }
  }

  const skills = Array.from(skillMap.values());
  skills.sort((a, b) => b.priority - a.priority);

  return { version: "1.0.0", skills };
}

export function findSkill(index: SkillIndex, name: string): IndexSkillEntry | undefined {
  return index.skills.find((s) => s.name === name);
}
