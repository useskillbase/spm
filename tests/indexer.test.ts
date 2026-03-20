import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { buildIndex, writeIndex } from "../src/core/indexer.js";
import { getIndexPath } from "../src/core/paths.js";
import { createTmpDir, removeTmpDir, minimalFrontmatter, installSkillFixture } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("buildIndex", () => {
  it("returns empty index when installed/ does not exist", async () => {
    const index = await buildIndex(tmpDir);
    expect(index.skills).toEqual([]);
    expect(index.version).toBe("1.0.0");
  });

  it("returns empty index when installed/ is empty", async () => {
    await fs.mkdir(path.join(tmpDir, "installed"), { recursive: true });
    const index = await buildIndex(tmpDir);
    expect(index.skills).toEqual([]);
  });

  it("indexes a single valid skill", async () => {
    const fm = minimalFrontmatter();
    await installSkillFixture(tmpDir, fm);
    const index = await buildIndex(tmpDir);

    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].name).toBe("test/skill");
    expect(index.skills[0].v).toBe("1.0.0");
    expect(index.skills[0].trigger).toBe("Test trigger");
    expect(index.skills[0].tags).toEqual(["test"]);
    expect(index.skills[0].priority).toBe(50);
    expect(index.skills[0].tokens_estimate).toBeGreaterThan(0);
  });

  it("sorts skills by priority descending", async () => {
    await installSkillFixture(tmpDir, minimalFrontmatter({
      name: "low",
      trigger: { description: "low", tags: ["l"], priority: 10 },
    }));
    await installSkillFixture(tmpDir, minimalFrontmatter({
      name: "high",
      trigger: { description: "high", tags: ["h"], priority: 90 },
    }));
    await installSkillFixture(tmpDir, minimalFrontmatter({
      name: "mid",
      trigger: { description: "mid", tags: ["m"], priority: 50 },
    }));

    const index = await buildIndex(tmpDir);
    expect(index.skills.map((s) => s.name)).toEqual([
      "test/high",
      "test/mid",
      "test/low",
    ]);
  });

  it("estimates tokens as content_length / 4", async () => {
    const content = "x".repeat(400);
    await installSkillFixture(tmpDir, minimalFrontmatter(), content);
    const index = await buildIndex(tmpDir);
    expect(index.skills[0].tokens_estimate).toBe(100);
  });

  it("indexes skills in author/name directory layout", async () => {
    const skillDir = path.join(tmpDir, "installed", "myauthor", "myskill");
    await fs.mkdir(skillDir, { recursive: true });
    const fm = minimalFrontmatter({ name: "myskill", author: "myauthor" });
    const skillMd = matter.stringify("content", fm as Record<string, unknown>);
    await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMd);

    const index = await buildIndex(tmpDir);
    expect(index.skills).toHaveLength(1);
    expect(index.skills[0].name).toBe("myauthor/myskill");
  });

  it("skips skills with invalid SKILL.md", async () => {
    const skillDir = path.join(tmpDir, "installed", "test", "bad");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "no frontmatter here");

    const index = await buildIndex(tmpDir);
    expect(index.skills).toEqual([]);
  });

  it("includes file_patterns when present", async () => {
    const fm = minimalFrontmatter({
      trigger: {
        description: "test",
        tags: ["test"],
        file_patterns: ["*.docx"],
        priority: 50,
      },
    });
    await installSkillFixture(tmpDir, fm);
    const index = await buildIndex(tmpDir);

    expect(index.skills[0].file_patterns).toEqual(["*.docx"]);
  });
});

describe("writeIndex", () => {
  it("writes index.json to disk", async () => {
    await installSkillFixture(tmpDir, minimalFrontmatter());
    const index = await writeIndex(tmpDir);

    const raw = await fs.readFile(getIndexPath(tmpDir), "utf-8");
    const onDisk = JSON.parse(raw);
    expect(onDisk.skills).toHaveLength(1);
    expect(index.skills).toHaveLength(1);
  });

  it("creates skills directory if not exists", async () => {
    const nestedDir = path.join(tmpDir, "nested", "dir");
    await writeIndex(nestedDir);
    const raw = await fs.readFile(getIndexPath(nestedDir), "utf-8");
    expect(JSON.parse(raw).skills).toEqual([]);
  });
});
