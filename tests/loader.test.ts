import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { loadSkill } from "../src/core/loader.js";
import { buildIndex } from "../src/core/indexer.js";
import { createTmpDir, removeTmpDir, minimalFrontmatter, installSkillFixture } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("loadSkill", () => {
  it("loads skill content from SKILL.md body", async () => {
    const content = "# My Skill\nDo amazing things.";
    await installSkillFixture(tmpDir, minimalFrontmatter(), content);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.content).toBe(content);
    expect(loaded.name).toBe("test/skill");
    expect(loaded.version).toBe("1.0.0");
  });

  it("loads skill with compact=true (same content, no separate compact file)", async () => {
    const content = "# Full version";
    await installSkillFixture(tmpDir, minimalFrontmatter(), content);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0], true);
    expect(loaded.content).toBe(content);
  });

  it("includes permissions from frontmatter", async () => {
    const fm = minimalFrontmatter({
      security: { permissions: ["file:read", "bash:execute"] },
    });
    await installSkillFixture(tmpDir, fm);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.permissions).toEqual(["file:read", "bash:execute"]);
  });

  it("includes works_with from frontmatter", async () => {
    const fm = minimalFrontmatter({
      works_with: [
        { skill: "core/xlsx", relationship: "parallel", description: "Companion" },
      ],
    });
    await installSkillFixture(tmpDir, fm);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.works_with).toHaveLength(1);
    expect(loaded.works_with![0].skill).toBe("core/xlsx");
  });

  it("returns empty permissions when no security in frontmatter", async () => {
    const fm = minimalFrontmatter();
    delete (fm as Record<string, unknown>).security;
    await installSkillFixture(tmpDir, fm);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.permissions).toEqual([]);
    expect(loaded.works_with).toBeUndefined();
  });

  it("throws when entry file is missing", async () => {
    await installSkillFixture(tmpDir, minimalFrontmatter());
    const index = await buildIndex(tmpDir);

    // Remove SKILL.md
    await fs.unlink(index.skills[0].entry);

    await expect(loadSkill(index.skills[0])).rejects.toThrow();
  });
});
