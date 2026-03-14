import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSkillsDir, getInstalledDir } from "../../core/paths.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import type { SkillManifest } from "../../types/index.js";
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
  const manifestPath = path.join(src, "skill.json");

  let manifest: SkillManifest;
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    const result = validateSkillManifest(data);
    if (!result.valid) {
      exitError(`Invalid skill.json:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
    }
    manifest = data as SkillManifest;
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      exitError(`Cannot read skill.json in "${skillPath}".`);
    }
    throw err;
  }

  const skillsDir = getGlobalSkillsDir();
  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, manifest.author, manifest.name);

  // Create parent directory
  await fs.mkdir(path.dirname(dest), { recursive: true });

  // Remove existing if present
  try {
    const stat = await fs.lstat(dest);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      await fs.rm(dest, { recursive: true, force: true });
    }
  } catch {
    // Does not exist — good
  }

  // Create symlink
  await fs.symlink(src, dest, "dir");

  const index = await writeIndex(skillsDir);
  await writeLock(skillsDir);

  log.success(`Linked ${manifest.author}/${manifest.name} → ${src}`);
  log.info(`${index.skills.length} skill(s) indexed`);
}
