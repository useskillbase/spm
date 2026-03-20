import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import matter from "gray-matter";
import type { SkillFrontmatter } from "../src/types/index.js";

export async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "skillbase-test-"));
}

export async function removeTmpDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export function minimalFrontmatter(overrides: Partial<SkillFrontmatter> = {}): SkillFrontmatter {
  return {
    schema_version: 3,
    name: "skill",
    version: "1.0.0",
    language: "en",
    description: "A test skill",
    trigger: {
      description: "Test trigger",
      tags: ["test"],
      priority: 50,
    },
    security: {
      permissions: [],
    },
    author: "test",
    license: "MIT",
    ...overrides,
  };
}

/** @deprecated Use minimalFrontmatter instead */
export const minimalManifest = minimalFrontmatter;

export async function installSkillFixture(
  skillsDir: string,
  frontmatter: SkillFrontmatter,
  skillBody: string = "# Test Skill\nDo the thing.",
): Promise<string> {
  const skillDir = path.join(skillsDir, "installed", frontmatter.author, frontmatter.name);
  await fs.mkdir(skillDir, { recursive: true });
  const skillMd = matter.stringify(skillBody, frontmatter as Record<string, unknown>);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMd);
  return skillDir;
}
