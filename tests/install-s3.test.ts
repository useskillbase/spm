import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createTmpDir, removeTmpDir, minimalManifest } from "./helpers.js";
import { packSkill, unpackSkill, computeIntegrity } from "../src/core/storage/packager.js";

describe("install from S3 archive flow", () => {
  let tmpDir: string;
  let skillSrcDir: string;
  let installDir: string;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
    skillSrcDir = path.join(tmpDir, "source");
    installDir = path.join(tmpDir, "installed");
    await fs.mkdir(skillSrcDir, { recursive: true });
    await fs.mkdir(installDir, { recursive: true });
  });

  afterEach(async () => {
    await removeTmpDir(tmpDir);
  });

  it("pack → unpack roundtrip preserves all files", async () => {
    const manifest = minimalManifest({ name: "s3-skill" });
    await fs.writeFile(path.join(skillSrcDir, "skill.json"), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(skillSrcDir, "SKILL.md"), "# S3 Skill\nInstructions here.");
    await fs.mkdir(path.join(skillSrcDir, "assets"), { recursive: true });
    await fs.writeFile(path.join(skillSrcDir, "assets", "data.txt"), "asset data");

    const pkg = await packSkill(skillSrcDir);
    expect(pkg.data.length).toBeGreaterThan(0);
    expect(pkg.filesCount).toBe(3);

    const dest = path.join(installDir, "test", "s3-skill");
    const files = await unpackSkill(pkg.data, dest);

    expect(files).toContain("skill.json");
    expect(files).toContain("SKILL.md");
    expect(files).toContain("assets/data.txt");

    const installedManifest = JSON.parse(await fs.readFile(path.join(dest, "skill.json"), "utf-8"));
    expect(installedManifest.name).toBe("s3-skill");

    const installedContent = await fs.readFile(path.join(dest, "SKILL.md"), "utf-8");
    expect(installedContent).toBe("# S3 Skill\nInstructions here.");

    const installedAsset = await fs.readFile(path.join(dest, "assets", "data.txt"), "utf-8");
    expect(installedAsset).toBe("asset data");
  });

  it("integrity verification detects correct archive", async () => {
    const manifest = minimalManifest();
    await fs.writeFile(path.join(skillSrcDir, "skill.json"), JSON.stringify(manifest));
    await fs.writeFile(path.join(skillSrcDir, "SKILL.md"), "content");

    const pkg = await packSkill(skillSrcDir);
    const actual = computeIntegrity(pkg.data);

    expect(actual).toBe(pkg.integrity);
    expect(actual).toMatch(/^sha256-[a-f0-9]{64}$/);
  });

  it("integrity verification detects tampered archive", async () => {
    const manifest = minimalManifest();
    await fs.writeFile(path.join(skillSrcDir, "skill.json"), JSON.stringify(manifest));
    await fs.writeFile(path.join(skillSrcDir, "SKILL.md"), "content");

    const pkg = await packSkill(skillSrcDir);

    // Tamper with the archive
    const tampered = Buffer.from(pkg.data);
    tampered[tampered.length - 10] = tampered[tampered.length - 10]! ^ 0xff;

    const actual = computeIntegrity(tampered);
    expect(actual).not.toBe(pkg.integrity);
  });

});
