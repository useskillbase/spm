import { readConfig } from "../../core/config.js";
import { getClientForSkill } from "../../core/registry-client.js";
import { readManifest } from "../../core/manifest.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { log, exitError } from "../ui.js";
import { installSingleFromRegistry, resolveSkillsDir } from "./add.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "install",
  description: "Install all skill dependencies from skill.json",
  group: "manage",
  aliases: ["i"],
  options: [
    { flags: "-g, --global", description: "Install to global skills directory" },
  ],
  handler: installAllCommand,
};

function parseSkillRef(ref: string): { author: string; name: string } | null {
  const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (!match) return null;
  return { author: match[1], name: match[2] };
}

export async function installAllCommand(
  options: { global?: boolean },
): Promise<void> {
  const { skillsDir } = await resolveSkillsDir(options.global);
  const cwd = process.cwd();
  const manifest = await readManifest(cwd);

  if (!manifest) {
    exitError("No skill.json found. Run 'spm init --project' first.");
  }

  const entries = Object.entries(manifest.dependencies);
  if (entries.length === 0) {
    log.info("No dependencies in skill.json.");
    return;
  }

  const config = await readConfig();

  log.step(`Installing ${entries.length} skill(s) from skill.json...`);
  for (const [skillRef] of entries) {
    const parsed = parseSkillRef(skillRef);
    if (!parsed) {
      log.warning(`Skipping invalid ref: ${skillRef}`);
      continue;
    }

    const client = getClientForSkill(config, skillRef);
    if (!client) {
      log.warning(`No registry for ${skillRef}, skipping.`);
      continue;
    }

    await installSingleFromRegistry(parsed.author, parsed.name, skillsDir, client);
  }

  const index = await writeIndex(skillsDir);
  const lock = await writeLock(skillsDir);

  log.success(`Done. ${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}
