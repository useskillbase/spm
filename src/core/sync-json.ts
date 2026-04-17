import fs from "node:fs/promises";
import path from "node:path";
import type { SyncJson } from "../types/index.js";
import { getSyncJsonPath, getSkillbaseDir } from "./paths.js";

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
): Promise<{ syncJson: SyncJson; dir: string } | null> {
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
