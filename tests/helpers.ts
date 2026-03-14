import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { SkillManifest } from "../src/types/index.js";

export async function createTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "skillbase-test-"));
}

export async function removeTmpDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export function minimalManifest(overrides: Partial<SkillManifest> = {}): SkillManifest {
  return {
    schema_version: 1,
    name: "skill",
    version: "1.0.0",
    language: "en",
    description: "A test skill",
    trigger: {
      description: "Test trigger",
      tags: ["test"],
      priority: 50,
    },
    dependencies: {},
    compatibility: {
      min_context_tokens: 1000,
      requires: [],
      models: [],
    },
    entry: "SKILL.md",
    security: {
      permissions: [],
    },
    author: "test",
    license: "MIT",
    ...overrides,
  };
}

export async function installSkillFixture(
  skillsDir: string,
  manifest: SkillManifest,
  skillContent: string = "# Test Skill\nDo the thing.",
): Promise<string> {
  const skillDir = path.join(skillsDir, "installed", manifest.author, manifest.name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "skill.json"), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(skillDir, manifest.entry), skillContent);
  if (manifest.compact_entry) {
    await fs.writeFile(path.join(skillDir, manifest.compact_entry), "# Compact\nShort version.");
  }
  return skillDir;
}
