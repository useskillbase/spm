import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { buildLock, writeLock } from "../src/core/lock.js";
import { createTmpDir, removeTmpDir, minimalManifest, installSkillFixture } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("buildLock", () => {
  it("returns empty lock when installed/ does not exist", async () => {
    const lock = await buildLock(tmpDir);
    expect(lock.lock_version).toBe(1);
    expect(lock.total_tokens_estimate).toBe(0);
    expect(Object.keys(lock.skills)).toHaveLength(0);
  });

  it("generates lock for installed skill with SHA-256 hash", async () => {
    const manifest = minimalManifest({ dependencies: { "core/base": "^1.0.0" } });
    await installSkillFixture(tmpDir, manifest, "# Content here");
    const lock = await buildLock(tmpDir);

    const entry = lock.skills["skill"];
    expect(entry).toBeDefined();
    expect(entry.version).toBe("1.0.0");
    expect(entry.integrity).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(entry.tokens_estimate).toBeGreaterThan(0);
    expect(entry.dependencies).toEqual({ "core/base": "^1.0.0" });
  });

  it("sums total_tokens_estimate across all skills", async () => {
    const content = "x".repeat(100);
    await installSkillFixture(tmpDir, minimalManifest({ name: "a" }), content);
    await installSkillFixture(tmpDir, minimalManifest({ name: "b" }), content);
    const lock = await buildLock(tmpDir);

    expect(lock.total_tokens_estimate).toBe(
      lock.skills["a"].tokens_estimate + lock.skills["b"].tokens_estimate,
    );
  });

  it("produces different hashes for different content", async () => {
    await installSkillFixture(tmpDir, minimalManifest({ name: "a" }), "Content A");
    await installSkillFixture(tmpDir, minimalManifest({ name: "b" }), "Content B");
    const lock = await buildLock(tmpDir);

    expect(lock.skills["a"].integrity).not.toBe(lock.skills["b"].integrity);
  });

  it("skips skills with missing skill.json", async () => {
    const skillDir = path.join(tmpDir, "installed", "test", "bad");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "no manifest");

    const lock = await buildLock(tmpDir);
    expect(Object.keys(lock.skills)).toHaveLength(0);
  });
});

describe("writeLock", () => {
  it("writes skills.lock to disk", async () => {
    await installSkillFixture(tmpDir, minimalManifest());
    await writeLock(tmpDir);

    const raw = await fs.readFile(path.join(tmpDir, "skills.lock"), "utf-8");
    const lock = JSON.parse(raw);
    expect(lock.lock_version).toBe(1);
    expect(lock.skills["skill"]).toBeDefined();
  });
});
