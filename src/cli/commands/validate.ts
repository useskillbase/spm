import fs from "node:fs/promises";
import path from "node:path";
import { parseSkill } from "../../core/skill-parser.js";
import { validateSkillFrontmatter } from "../../schema/skill-schema.js";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "validate",
  description: "Validate a skill directory",
  group: "system",
  args: [{ name: "path", required: true }],
  handler: validateCommand,
};

export async function validateCommand(skillPath: string): Promise<void> {
  const dir = path.resolve(skillPath);

  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      exitError(`"${skillPath}" is not a directory.`);
    }
  } catch {
    exitError(`"${skillPath}" does not exist.`);
  }

  const skillMdPath = path.join(dir, "SKILL.md");
  let raw: string;
  try {
    raw = await fs.readFile(skillMdPath, "utf-8");
  } catch {
    exitError(`SKILL.md not found in "${skillPath}".`);
  }

  const parsed = parseSkill(raw);
  const result = validateSkillFrontmatter(parsed.frontmatter);
  if (!result.valid) {
    exitError(`Validation failed:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  log.success(`Valid: ${parsed.frontmatter.name}@${parsed.frontmatter.version}`);
}
