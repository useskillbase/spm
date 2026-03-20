import fs from "node:fs/promises";
import { parseSkill } from "./skill-parser.js";
import type { IndexSkillEntry, LoadedSkill } from "../types/index.js";
import { runLoadHooks } from "./plugins/index.js";

export async function loadSkill(
  entry: IndexSkillEntry,
  _compact: boolean = false,
): Promise<LoadedSkill> {
  const raw = await fs.readFile(entry.entry, "utf-8");
  const parsed = parseSkill(raw);

  const permissions = parsed.frontmatter.security?.permissions ?? [];
  const fileScope = parsed.frontmatter.security?.file_scope;
  const worksWithList = parsed.frontmatter.works_with;

  const content = await runLoadHooks({
    content: parsed.body,
    name: entry.name,
    version: entry.v,
    permissions,
  });

  return {
    name: entry.name,
    version: entry.v,
    content,
    permissions,
    file_scope: fileScope,
    tokens_estimate: entry.tokens_estimate,
    works_with: worksWithList,
  };
}
