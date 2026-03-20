import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSkillsDir, getInstalledDir } from "../../core/paths.js";
import { parseSkillFile } from "../../core/skill-parser.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "link",
  description: "Link a local skill directory for development",
  group: "manage",
  args: [{ name: "path", required: true }],
  handler: linkCommand,
};

export async function linkCommand(skillPath: string): Promise<void> {
  const src = path.resolve(skillPath);

  let author: string;
  let name: string;
  try {
    const parsed = await parseSkillFile(src);
    author = parsed.frontmatter.author;
    name = parsed.frontmatter.name;
  } catch {
    exitError(`Cannot read SKILL.md in "${skillPath}".`);
  }

  const skillsDir = getGlobalSkillsDir();
  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, name);

  await fs.mkdir(path.dirname(dest), { recursive: true });

  try {
    const stat = await fs.lstat(dest);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      await fs.rm(dest, { recursive: true, force: true });
    }
  } catch {
    // Does not exist — good
  }

  await fs.symlink(src, dest, "dir");

  const index = await writeIndex(skillsDir);
  await writeLock(skillsDir);

  log.success(`Linked ${author}/${name} → ${src}`);
  log.info(`${index.skills.length} skill(s) indexed`);
}
