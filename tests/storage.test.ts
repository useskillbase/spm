import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createTmpDir, removeTmpDir, minimalManifest } from "./helpers.js";
import { LocalStorageProvider } from "../src/core/storage/local-provider.js";
import { packSkill, unpackSkill, computeIntegrity } from "../src/core/storage/packager.js";
import { createStorageProvider, buildSkillS3Key } from "../src/core/storage/index.js";

describe("LocalStorageProvider", () => {
  let tmpDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
    provider = new LocalStorageProvider({ type: "local", basePath: tmpDir });
  });

  afterEach(async () => {
    await removeTmpDir(tmpDir);
  });

  it("uploads and downloads data", async () => {
    const data = Buffer.from("hello world");
    const result = await provider.upload("test/file.tar.gz", data);

    expect(result.key).toBe("test/file.tar.gz");
    expect(result.size).toBe(data.length);
    expect(result.integrity).toMatch(/^sha256-/);

    const downloaded = await provider.download("test/file.tar.gz");
    expect(downloaded.data.toString()).toBe("hello world");
    expect(downloaded.size).toBe(data.length);
  });

  it("checks existence", async () => {
    expect(await provider.exists("missing/file.tar.gz")).toBe(false);

    await provider.upload("existing/file.tar.gz", Buffer.from("data"));
    expect(await provider.exists("existing/file.tar.gz")).toBe(true);
  });

  it("deletes files", async () => {
    await provider.upload("to-delete.tar.gz", Buffer.from("data"));
    expect(await provider.exists("to-delete.tar.gz")).toBe(true);

    await provider.delete("to-delete.tar.gz");
    expect(await provider.exists("to-delete.tar.gz")).toBe(false);
  });

  it("returns file URL for getSignedUrl", async () => {
    await provider.upload("signed.tar.gz", Buffer.from("data"));
    const url = await provider.getSignedUrl("signed.tar.gz");
    expect(url).toMatch(/^file:\/\//);
  });
});

describe("packSkill / unpackSkill", () => {
  let srcDir: string;
  let destDir: string;

  beforeEach(async () => {
    srcDir = await createTmpDir();
    destDir = await createTmpDir();

    const manifest = minimalManifest();
    await fs.writeFile(path.join(srcDir, "skill.json"), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(srcDir, "SKILL.md"), "# Hello\nThis is a test skill.");
  });

  afterEach(async () => {
    await removeTmpDir(srcDir);
    await removeTmpDir(destDir);
  });

  it("packs a skill directory into tar.gz", async () => {
    const result = await packSkill(srcDir);

    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.integrity).toMatch(/^sha256-/);
    expect(result.filesCount).toBe(2);
  });

  it("unpacks a tar.gz into a directory", async () => {
    const packed = await packSkill(srcDir);
    const files = await unpackSkill(packed.data, destDir);

    expect(files).toContain("skill.json");
    expect(files).toContain("SKILL.md");

    const manifestRaw = await fs.readFile(path.join(destDir, "skill.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.name).toBe("skill");

    const content = await fs.readFile(path.join(destDir, "SKILL.md"), "utf-8");
    expect(content).toBe("# Hello\nThis is a test skill.");
  });

  it("roundtrip preserves integrity", async () => {
    const packed = await packSkill(srcDir);
    const integrity = computeIntegrity(packed.data);
    expect(integrity).toBe(packed.integrity);
  });

  it("packs nested directories", async () => {
    await fs.mkdir(path.join(srcDir, "examples"), { recursive: true });
    await fs.writeFile(path.join(srcDir, "examples", "demo.md"), "# Demo");

    const packed = await packSkill(srcDir);
    expect(packed.filesCount).toBe(3);

    const files = await unpackSkill(packed.data, destDir);
    expect(files).toContain("examples/demo.md");

    const content = await fs.readFile(path.join(destDir, "examples", "demo.md"), "utf-8");
    expect(content).toBe("# Demo");
  });

  it("ignores node_modules and .git", async () => {
    await fs.mkdir(path.join(srcDir, "node_modules", "pkg"), { recursive: true });
    await fs.writeFile(path.join(srcDir, "node_modules", "pkg", "index.js"), "module.exports = {}");
    await fs.mkdir(path.join(srcDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(srcDir, ".git", "HEAD"), "ref: refs/heads/main");

    const packed = await packSkill(srcDir);
    expect(packed.filesCount).toBe(2); // only skill.json + SKILL.md
  });
});

describe("buildSkillS3Key", () => {
  it("builds correct key structure", () => {
    expect(buildSkillS3Key("john", "my-skill", "1.0.0")).toBe("skills/john/my-skill/1.0.0.tar.gz");
  });
});

describe("createStorageProvider", () => {
  it("creates local provider", () => {
    const provider = createStorageProvider({ type: "local", basePath: "/tmp" });
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it("throws on unknown type", () => {
    expect(() => createStorageProvider({ type: "unknown" as "s3" })).toThrow("Unknown storage type");
  });
});
