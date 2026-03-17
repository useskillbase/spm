import path from "node:path";
import semver from "semver";
import { readConfig } from "../../core/config.js";
import { getClientForSkill } from "../../core/registry-client.js";
import { getSkillIndex } from "../../core/registry.js";
import { installSingleFromRegistry, resolveSkillsDir } from "./add.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { log, spinner, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "update",
  description: "Update installed skills to latest versions",
  group: "manage",
  args: [{ name: "skill", required: false, description: "Specific skill to update (author/name)" }],
  options: [
    { flags: "-g, --global", description: "Update globally installed skills" },
    { flags: "-f, --force", description: "Re-install even if version matches (useful when content changed)" },
  ],
  handler: updateCommand,
};

export async function updateCommand(
  skill: string | undefined,
  options: { global?: boolean; force?: boolean },
): Promise<void> {
  const { skillsDir } = await resolveSkillsDir(options.global);
  const index = await getSkillIndex();
  const config = await readConfig();

  if (index.skills.length === 0) {
    exitError("No skills installed.");
  }

  // Filter to specific skill if provided
  const toCheck = skill
    ? index.skills.filter((s) => s.name === skill)
    : index.skills;

  if (skill && toCheck.length === 0) {
    exitError(`Skill "${skill}" is not installed.`);
  }

  const s = spinner();
  s.start(`Checking ${toCheck.length} skill(s) for updates...`);

  let updated = 0;
  let upToDate = 0;
  let failed = 0;

  for (const entry of toCheck) {
    // entry.name is "author/name" or bare "name"
    const parts = entry.name.split("/");
    if (parts.length !== 2) {
      // Can't update non-registry skills (no author/name format)
      continue;
    }

    const [author, name] = parts;
    const client = getClientForSkill(config, entry.name);
    if (!client) continue;

    try {
      const versions = await client.getVersions(author, name);
      if (versions.length === 0) continue;

      const latest = versions[0].version;
      const current = entry.v;

      const isUpToDate = semver.valid(latest) && semver.valid(current) && semver.lte(latest, current);

      if (isUpToDate && !options.force) {
        upToDate++;
        continue;
      }

      const label = isUpToDate
        ? `Re-installing ${entry.name}@${current}...`
        : `Updating ${entry.name} ${current} → ${latest}...`;
      s.message(label);
      await installSingleFromRegistry(author, name, skillsDir, client, isUpToDate ? current : latest);
      updated++;
      log.success(isUpToDate
        ? `Re-installed ${entry.name}@${current}`
        : `Updated ${entry.name} ${current} → ${latest}`,
      );
    } catch (err) {
      failed++;
      log.error(`Failed to update ${entry.name}: ${(err as Error).message}`);
    }
  }

  s.stop("Done");

  await writeIndex(skillsDir);
  await writeLock(skillsDir);

  const parts: string[] = [];
  if (updated > 0) parts.push(`${updated} updated`);
  if (upToDate > 0) parts.push(`${upToDate} up to date`);
  if (failed > 0) parts.push(`${failed} failed`);

  if (parts.length > 0) {
    log.success(parts.join(", "));
  }
}
