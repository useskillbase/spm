import fs from "node:fs/promises";
import path from "node:path";
import { parseSkill } from "./skill-parser.js";
import type { IndexSkillEntry, LoadedSkill } from "../types/index.js";
import { runLoadHooks } from "./plugins/index.js";

const LISTING_IGNORED = new Set([".DS_Store", "Thumbs.db", ".git"]);

async function collectFiles(dir: string, base: string = dir): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (LISTING_IGNORED.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...(await collectFiles(full, base)));
    } else {
      const rel = path.relative(base, full);
      if (rel !== "SKILL.md" && rel !== "SOUL.md") {
        results.push(rel);
      }
    }
  }
  return results.sort();
}

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

  const installPath = path.dirname(entry.entry);
  const files = await collectFiles(installPath);

  return {
    name: entry.name,
    version: entry.v,
    content,
    permissions,
    file_scope: fileScope,
    tokens_estimate: entry.tokens_estimate,
    works_with: worksWithList,
    files: files.length > 0 ? files : undefined,
    install_path: installPath,
  };
}
