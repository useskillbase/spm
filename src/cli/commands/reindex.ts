import fs from "node:fs/promises";
import { writeIndex } from "../../core/indexer.js";
import {
  getGlobalSkillsDir,
  getProjectSkillsDir,
  getInstalledDir,
} from "../../core/paths.js";
import { log } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "reindex",
  description: "Rebuild skill index",
  group: "system",
  options: [
    { flags: "--project", description: "Reindex project skills only" },
  ],
  handler: reindexCommand,
};

async function reindexCommand(options: { project?: boolean }): Promise<void> {
  const globalDir = getGlobalSkillsDir();
  const projectDir = getProjectSkillsDir(process.cwd());

  if (!options.project) {
    const index = await writeIndex(globalDir);
    log.success(`Global: ${index.skills.length} skill(s) indexed`);
  }

  if (options.project) {
    const installedDir = getInstalledDir(projectDir);
    try {
      const stat = await fs.stat(installedDir);
      if (stat.isDirectory()) {
        const index = await writeIndex(projectDir);
        log.success(`Project: ${index.skills.length} skill(s) indexed`);
      }
    } catch {
      log.info("No .skills/installed/ directory in current project.");
    }
  }
}
