import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSkillsDir, getInstalledDir } from "../../core/paths.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "uninstall",
  description: "Uninstall a skill",
  group: "manage",
  args: [{ name: "name", required: true }],
  handler: uninstallCommand,
};

async function findSkillDir(installedDir: string, name: string): Promise<{ skillDir: string; fullName: string } | null> {
  // Try author/name format first
  const nameParts = name.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (nameParts) {
    const skillDir = path.join(installedDir, nameParts[1], nameParts[2]);
    try {
      await fs.access(skillDir);
      return { skillDir, fullName: name };
    } catch {
      return null;
    }
  }

  // Bare name — search through all author dirs
  let authors: string[];
  try {
    authors = await fs.readdir(installedDir);
  } catch {
    return null;
  }

  for (const author of authors) {
    const authorDir = path.join(installedDir, author);
    const stat = await fs.stat(authorDir);
    if (!stat.isDirectory()) continue;

    const skillDir = path.join(authorDir, name);
    try {
      await fs.access(skillDir);
      return { skillDir, fullName: `${author}/${name}` };
    } catch {
      continue;
    }
  }

  return null;
}

export async function uninstallCommand(name: string): Promise<void> {
  const skillsDir = getGlobalSkillsDir();
  const installedDir = getInstalledDir(skillsDir);

  const found = await findSkillDir(installedDir, name);
  if (!found) {
    exitError(`Skill "${name}" is not installed.`);
  }

  const { skillDir, fullName } = found;
  const author = fullName.split("/")[0];

  await fs.rm(skillDir, { recursive: true });

  // Clean up empty author directory
  const authorDir = path.join(installedDir, author);
  const remaining = await fs.readdir(authorDir);
  if (remaining.length === 0) {
    await fs.rmdir(authorDir);
  }

  // Rebuild index and lock
  const index = await writeIndex(skillsDir);
  await writeLock(skillsDir);

  log.success(`Uninstalled ${fullName}`);
  log.info(`${index.skills.length} skill(s) remaining`);
}
