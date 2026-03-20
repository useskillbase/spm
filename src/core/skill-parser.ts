import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { ParsedSkill, SkillFrontmatter } from "../types/index.js";

const REQUIRED_FIELDS = ["schema_version", "name", "version", "author", "license", "description"] as const;
const TRIGGER_REQUIRED = ["description", "tags", "priority"] as const;

export class SkillParseError extends Error {
  constructor(
    message: string,
    public readonly fields: string[] = [],
  ) {
    super(message);
    this.name = "SkillParseError";
  }
}

/**
 * Parse a SKILL.md string into frontmatter + body.
 */
export function parseSkill(content: string): ParsedSkill {
  const { data, content: body } = matter(content);

  const missing = REQUIRED_FIELDS.filter((f) => data[f] === undefined || data[f] === "");
  if (missing.length > 0) {
    throw new SkillParseError(
      `SKILL.md missing required fields: ${missing.join(", ")}`,
      missing as unknown as string[],
    );
  }

  if (data.trigger) {
    const triggerMissing = TRIGGER_REQUIRED.filter(
      (f) => data.trigger[f] === undefined || data.trigger[f] === "",
    );
    if (triggerMissing.length > 0) {
      throw new SkillParseError(
        `trigger missing required fields: ${triggerMissing.join(", ")}`,
        triggerMissing.map((f) => `trigger.${f}`),
      );
    }
  }

  return {
    frontmatter: data as SkillFrontmatter,
    body: body.trim(),
  };
}

/**
 * Parse a SKILL.md file from disk.
 */
export async function parseSkillFile(skillDir: string): Promise<ParsedSkill> {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  const raw = await fs.readFile(skillMdPath, "utf-8");
  return parseSkill(raw);
}

/**
 * Serialize a ParsedSkill back to SKILL.md string.
 */
export function serializeSkill(skill: ParsedSkill): string {
  return matter.stringify(skill.body, skill.frontmatter);
}
