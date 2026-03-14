import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { createTmpDir, removeTmpDir } from "./helpers.js";
import {
  readConfig,
  writeConfig,
  resolveRegistry,
  getRegistryToken,
  getDefaultConfig,
} from "../src/core/config.js";
import type { SkillsConfig } from "../src/types/index.js";

describe("config with registries", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
  });

  afterEach(async () => {
    await removeTmpDir(tmpDir);
  });

  it("default config has public registry and default scope", async () => {
    const config = getDefaultConfig();
    expect(config.registries).toEqual([
      { name: "public", url: "https://skillbase-registry.fly.dev" },
    ]);
    expect(config.scopes).toEqual({ "*": "public" });
    expect(config.github).toBeUndefined();
  });

  it("preserves registry entries through write/read", async () => {
    const config = getDefaultConfig();
    config.registries = [
      { name: "public", url: "https://registry.skillbase.space" },
      { name: "company", url: "https://skills.company.com", token: "sk-123" },
    ];
    config.scopes = {
      "@company": "company",
      "*": "public",
    };

    await writeConfig(config, tmpDir);
    const loaded = await readConfig(tmpDir);

    expect(loaded.registries).toHaveLength(2);
    expect(loaded.registries[0].name).toBe("public");
    expect(loaded.registries[1].token).toBe("sk-123");
    expect(loaded.scopes["@company"]).toBe("company");
  });

  it("preserves github config", async () => {
    const config = getDefaultConfig();
    config.github = { token: "ghp_abc123" };

    await writeConfig(config, tmpDir);
    const loaded = await readConfig(tmpDir);

    expect(loaded.github?.token).toBe("ghp_abc123");
  });

  it("merges partial config with defaults", async () => {
    const partial = {
      registries: [{ name: "test", url: "http://localhost:3717" }],
    };
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify(partial),
    );

    const loaded = await readConfig(tmpDir);
    // Defaults should be filled in
    expect(loaded.feedback.enabled).toBe(true);
    expect(loaded.tools.skill_list).toBe(true);
    // But registries from partial
    expect(loaded.registries).toHaveLength(1);
    expect(loaded.registries[0].name).toBe("test");
  });
});

describe("resolveRegistry", () => {
  const config: SkillsConfig = {
    ...getDefaultConfig(),
    registries: [
      { name: "public", url: "https://registry.skillbase.space" },
      { name: "company", url: "https://skills.company.com", token: "sk-123" },
    ],
    scopes: {
      "*": "public",
    },
  };

  it("resolves skill to default registry", () => {
    const url = resolveRegistry(config, "community/code-reviewer");
    expect(url).toBe("https://registry.skillbase.space");
  });

  it("resolves any skill ref to default registry", () => {
    const url = resolveRegistry(config, "company/internal-linter");
    expect(url).toBe("https://registry.skillbase.space");
  });

  it("returns null if no matching registry", () => {
    const noRegistries: SkillsConfig = {
      ...getDefaultConfig(),
      registries: [],
      scopes: { "*": "nonexistent" },
    };
    const url = resolveRegistry(noRegistries, "any/skill");
    expect(url).toBeNull();
  });
});

describe("getRegistryToken", () => {
  const config: SkillsConfig = {
    ...getDefaultConfig(),
    registries: [
      { name: "public", url: "https://registry.skillbase.space" },
      { name: "company", url: "https://skills.company.com", token: "sk-123" },
    ],
    scopes: {},
  };

  it("returns token for authenticated registry", () => {
    expect(getRegistryToken(config, "company")).toBe("sk-123");
  });

  it("returns undefined for unauthenticated registry", () => {
    expect(getRegistryToken(config, "public")).toBeUndefined();
  });

  it("returns undefined for unknown registry", () => {
    expect(getRegistryToken(config, "unknown")).toBeUndefined();
  });
});
