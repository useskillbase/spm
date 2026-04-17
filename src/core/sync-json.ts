import fs from "node:fs/promises";
import path from "node:path";
import type { SyncJson } from "../types/index.js";
import { getSyncJsonPath, getSkillbaseDir } from "./paths.js";

export interface DiscoveredSyncJson {
  syncJson: SyncJson;
  dir: string;
}

/**
 * Read `.skillbase/sync.json` from the given directory.
 * Returns null if file doesn't exist or is invalid.
 */
export async function readSyncJson(cwd: string): Promise<SyncJson | null> {
  const filePath = getSyncJsonPath(cwd);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SyncJson>;
    if (!parsed.company || !parsed.project_id || !parsed.project_slug) {
      return null;
    }
    return parsed as SyncJson;
  } catch {
    return null;
  }
}

/**
 * Write `.skillbase/sync.json` to the given directory.
 * Creates `.skillbase/` if it doesn't exist.
 */
export async function writeSyncJson(
  cwd: string,
  data: SyncJson,
): Promise<void> {
  const dir = getSkillbaseDir(cwd);
  await fs.mkdir(dir, { recursive: true });
  const filePath = getSyncJsonPath(cwd);
  await fs.writeFile(
    filePath,
    JSON.stringify(data, null, 2) + "\n",
    "utf-8",
  );
}

/**
 * Walk up from cwd to find the nearest `.skillbase/sync.json`.
 * Stops at filesystem root.
 */
export async function findSyncJson(
  startDir: string,
): Promise<DiscoveredSyncJson | null> {
  let dir = path.resolve(startDir);

  while (true) {
    const result = await readSyncJson(dir);
    if (result) return { syncJson: result, dir };

    const parent = path.dirname(dir);
    if (parent === dir) break; // reached root
    dir = parent;
  }

  return null;
}

/**
 * Scan immediate child directories for `.skillbase/sync.json`.
 * Used when cwd is a parent directory (e.g. ~/Projects/skillbase/)
 * that contains multiple project subdirectories.
 */
export async function discoverChildSyncJsons(
  parentDir: string,
): Promise<DiscoveredSyncJson[]> {
  const resolved = path.resolve(parentDir);
  const results: DiscoveredSyncJson[] = [];

  let names: string[];
  try {
    names = await fs.readdir(resolved);
  } catch {
    return results;
  }

  for (const name of names) {
    const childDir = path.join(resolved, name);
    try {
      const stat = await fs.stat(childDir);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    const syncJson = await readSyncJson(childDir);
    if (syncJson) {
      results.push({ syncJson, dir: childDir });
    }
  }

  return results;
}
