import { describe, it, expect } from "vitest";
import { getClientForSkill } from "../src/core/registry-client.js";
import { getDefaultConfig } from "../src/core/config.js";
import type { SkillsConfig } from "../src/types/index.js";

describe("getClientForSkill", () => {
  const config: SkillsConfig = {
    ...getDefaultConfig(),
    registries: [
      { name: "public", url: "https://registry.skillbase.space" },
      { name: "company", url: "https://skills.company.com", token: "sk-123" },
    ],
    scopes: {
      "@company": "company",
      "*": "public",
    },
  };

  it("returns client for scoped skill", () => {
    const client = getClientForSkill(config, "company/my-skill");
    expect(client).not.toBeNull();
  });

  it("returns client for default scope", () => {
    const client = getClientForSkill(config, "community/code-reviewer");
    expect(client).not.toBeNull();
  });

  it("returns null when no registries configured", () => {
    const emptyConfig: SkillsConfig = {
      ...getDefaultConfig(),
      registries: [],
      scopes: { "*": "nonexistent" },
    };
    const client = getClientForSkill(emptyConfig, "any/skill");
    expect(client).toBeNull();
  });

  it("returns null when scope maps to unknown registry", () => {
    const badConfig: SkillsConfig = {
      ...getDefaultConfig(),
      registries: [{ name: "public", url: "https://registry.skillbase.space" }],
      scopes: { "*": "missing" },
    };
    const client = getClientForSkill(badConfig, "any/skill");
    expect(client).toBeNull();
  });
});
