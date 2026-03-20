import fs from "node:fs/promises";
import { uninstallCommand } from "./uninstall.js";
import {
  getGlobalSkillsDir,
  getProjectSkillsDir,
  getSoulMdPath,
} from "../../core/paths.js";
import { readConfig } from "../../core/config.js";
import { setActivePersona } from "../../core/persona.js";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "remove",
  description: "Remove a skill or persona",
  group: "manage",
  aliases: ["rm"],
  args: [{ name: "name", required: false }],
  options: [],
  handler: removeCommand,
};

function parseRef(ref: string): { author: string; name: string } | null {
  const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (!match) return null;
  return { author: match[1], name: match[2] };
}

async function removePersona(ref: string): Promise<void> {
  const parsed = parseRef(ref);
  if (!parsed) {
    exitError(`Invalid persona reference "${ref}". Expected author/name.`);
  }

  const globalDir = getGlobalSkillsDir();
  const projectDir = getProjectSkillsDir(process.cwd());

  let soulPath: string | null = null;
  for (const dir of [projectDir, globalDir]) {
    const candidate = getSoulMdPath(dir, parsed.author, parsed.name);
    try {
      await fs.access(candidate);
      soulPath = candidate;
      break;
    } catch {
      continue;
    }
  }

  if (!soulPath) {
    exitError(`Persona "${ref}" is not installed.`);
  }

  const config = await readConfig();
  if (config.active_persona === ref) {
    await setActivePersona(null);
    log.info(`Cleared active persona (was "${ref}").`);
  }

  // Remove the entire package directory (not just the SOUL.md file)
  const pkgDir = soulPath.replace(/\/SOUL\.md$/, "");
  await fs.rm(pkgDir, { recursive: true, force: true });
  log.success(`Removed persona "${ref}".`);
}

export async function removeCommand(
  name: string | undefined,
): Promise<void> {
  // Default: uninstall skill (interactive if no name)
  await uninstallCommand(name);
}

export { removePersona };
