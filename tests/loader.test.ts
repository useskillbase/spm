import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { loadSkill } from "../src/core/loader.js";
import { buildIndex } from "../src/core/indexer.js";
import { createTmpDir, removeTmpDir, minimalManifest, installSkillFixture } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("loadSkill", () => {
  it("loads skill content from entry file", async () => {
    const content = "# My Skill\nDo amazing things.";
    await installSkillFixture(tmpDir, minimalManifest(), content);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.content).toBe(content);
    expect(loaded.name).toBe("skill");
    expect(loaded.version).toBe("1.0.0");
  });

  it("loads compact entry when compact=true and available", async () => {
    const manifest = minimalManifest({ compact_entry: "SKILL.compact.md" });
    await installSkillFixture(tmpDir, manifest, "# Full version");
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0], true);
    expect(loaded.content).toBe("# Compact\nShort version.");
  });

  it("falls back to full entry when compact=true but no compact_entry", async () => {
    const content = "# Full only";
    await installSkillFixture(tmpDir, minimalManifest(), content);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0], true);
    expect(loaded.content).toBe(content);
  });

  it("includes permissions from manifest", async () => {
    const manifest = minimalManifest({
      security: { permissions: ["file:read", "bash:execute"] },
    });
    await installSkillFixture(tmpDir, manifest);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.permissions).toEqual(["file:read", "bash:execute"]);
  });

  it("includes works_with from manifest", async () => {
    const manifest = minimalManifest({
      works_with: [
        { skill: "core/xlsx", relationship: "parallel", description: "Companion" },
      ],
    });
    await installSkillFixture(tmpDir, manifest);
    const index = await buildIndex(tmpDir);

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.works_with).toHaveLength(1);
    expect(loaded.works_with![0].skill).toBe("core/xlsx");
  });

  it("returns empty permissions when manifest is missing", async () => {
    await installSkillFixture(tmpDir, minimalManifest());
    const index = await buildIndex(tmpDir);

    // Remove skill.json after indexing
    const skillDir = path.dirname(index.skills[0].entry);
    await fs.unlink(path.join(skillDir, "skill.json"));

    const loaded = await loadSkill(index.skills[0]);
    expect(loaded.permissions).toEqual([]);
    expect(loaded.works_with).toBeUndefined();
  });

  it("throws when entry file is missing", async () => {
    await installSkillFixture(tmpDir, minimalManifest());
    const index = await buildIndex(tmpDir);

    // Remove SKILL.md
    await fs.unlink(index.skills[0].entry);

    await expect(loadSkill(index.skills[0])).rejects.toThrow();
  });
});
