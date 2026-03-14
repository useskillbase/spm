import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { readConfig, writeConfig, getDefaultConfig } from "../src/core/config.js";
import { getConfigPath } from "../src/core/paths.js";
import { createTmpDir, removeTmpDir } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("getDefaultConfig", () => {
  it("returns a config with all tools enabled", () => {
    const config = getDefaultConfig();
    expect(config.tools.skill_list).toBe(true);
    expect(config.tools.skill_load).toBe(true);
    expect(config.tools.skill_context).toBe(true);
    expect(config.tools.skill_feedback).toBe(true);
    expect(config.tools.skill_search).toBe(true);
    expect(config.tools.skill_install).toBe(true);
  });

  it("returns feedback enabled by default", () => {
    const config = getDefaultConfig();
    expect(config.feedback.enabled).toBe(true);
    expect(config.feedback.automatic).toBe(true);
  });

  it("returns independent copies (no shared references)", () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    a.tools.skill_list = false;
    expect(b.tools.skill_list).toBe(true);
  });
});

describe("readConfig", () => {
  it("returns defaults when config.json does not exist", async () => {
    const config = await readConfig(tmpDir);
    const defaults = getDefaultConfig();
    expect(config).toEqual(defaults);
  });

  it("reads config from disk", async () => {
    const custom = getDefaultConfig();
    custom.tools.skill_feedback = false;
    await fs.writeFile(getConfigPath(tmpDir), JSON.stringify(custom), "utf-8");

    const config = await readConfig(tmpDir);
    expect(config.tools.skill_feedback).toBe(false);
    expect(config.tools.skill_list).toBe(true);
  });

  it("merges partial config with defaults", async () => {
    // Only specify feedback section, rest should come from defaults
    await fs.writeFile(
      getConfigPath(tmpDir),
      JSON.stringify({ feedback: { enabled: false } }),
      "utf-8",
    );

    const config = await readConfig(tmpDir);
    expect(config.feedback.enabled).toBe(false);
    expect(config.feedback.automatic).toBe(true); // default
    expect(config.tools.skill_list).toBe(true); // default
  });

  it("handles corrupted config.json gracefully", async () => {
    await fs.writeFile(getConfigPath(tmpDir), "{{invalid json", "utf-8");
    const config = await readConfig(tmpDir);
    expect(config).toEqual(getDefaultConfig());
  });

  it("handles empty config.json", async () => {
    await fs.writeFile(getConfigPath(tmpDir), "{}", "utf-8");
    const config = await readConfig(tmpDir);
    expect(config).toEqual(getDefaultConfig());
  });
});

describe("writeConfig", () => {
  it("writes config to disk and reads it back", async () => {
    const config = getDefaultConfig();
    config.feedback.enabled = false;
    config.tools.skill_install = false;

    await writeConfig(config, tmpDir);
    const readBack = await readConfig(tmpDir);
    expect(readBack.feedback.enabled).toBe(false);
    expect(readBack.tools.skill_install).toBe(false);
  });

  it("produces valid JSON with trailing newline", async () => {
    await writeConfig(getDefaultConfig(), tmpDir);
    const raw = await fs.readFile(getConfigPath(tmpDir), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
