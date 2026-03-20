import { describe, it, expect } from "vitest";
import { validateSkillFrontmatter } from "../src/schema/skill-schema.js";
import { minimalFrontmatter } from "./helpers.js";

describe("validateSkillFrontmatter", () => {
  it("accepts a valid minimal frontmatter", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts frontmatter with all optional fields", () => {
    const fm = minimalFrontmatter({
      works_with: [
        { skill: "@core/xlsx", relationship: "parallel", description: "Companion" },
      ],
      repository: "https://github.com/test/skill",
      dependencies: { "core/utils": "^1.0.0" },
    });
    const result = validateSkillFrontmatter(fm);
    expect(result.valid).toBe(true);
  });

  // -- Name validation --

  it("accepts simple lowercase name", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ name: "my-skill" }));
    expect(result.valid).toBe(true);
  });

  it("rejects name with @ prefix", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ name: "@scope/skill" }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects name with slash", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ name: "author/skill" }));
    expect(result.valid).toBe(false);
  });

  it("rejects name with uppercase", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ name: "MySkill" }));
    expect(result.valid).toBe(false);
  });

  it("rejects name with special characters", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ name: "skill_v2" }));
    expect(result.valid).toBe(false);
  });

  it("rejects name starting with hyphen", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ name: "-skill" }));
    expect(result.valid).toBe(false);
  });

  // -- Version validation --

  it("rejects non-semver version", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ version: "v1" }));
    expect(result.valid).toBe(false);
  });

  it("accepts semver with prerelease", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ version: "1.0.0-beta.1" }));
    expect(result.valid).toBe(true);
  });

  // -- Trigger validation --

  it("rejects empty tags array", () => {
    const result = validateSkillFrontmatter(
      minimalFrontmatter({ trigger: { description: "test", tags: [], priority: 50 } }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects priority out of range", () => {
    const over = validateSkillFrontmatter(
      minimalFrontmatter({ trigger: { description: "test", tags: ["t"], priority: 101 } }),
    );
    expect(over.valid).toBe(false);

    const under = validateSkillFrontmatter(
      minimalFrontmatter({ trigger: { description: "test", tags: ["t"], priority: -1 } }),
    );
    expect(under.valid).toBe(false);
  });

  it("accepts priority at boundaries (0 and 100)", () => {
    const zero = validateSkillFrontmatter(
      minimalFrontmatter({ trigger: { description: "test", tags: ["t"], priority: 0 } }),
    );
    expect(zero.valid).toBe(true);

    const hundred = validateSkillFrontmatter(
      minimalFrontmatter({ trigger: { description: "test", tags: ["t"], priority: 100 } }),
    );
    expect(hundred.valid).toBe(true);
  });

  // -- Missing required fields --

  it("rejects when required fields are missing", () => {
    const result = validateSkillFrontmatter({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects empty description", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ description: "" }));
    expect(result.valid).toBe(false);
  });

  // -- Language --

  it("rejects non-English language", () => {
    const result = validateSkillFrontmatter(minimalFrontmatter({ language: "ru" as any }));
    expect(result.valid).toBe(false);
  });

  // -- works_with relationship enum --

  it("rejects invalid works_with relationship", () => {
    const result = validateSkillFrontmatter(
      minimalFrontmatter({
        works_with: [
          { skill: "@test/x", relationship: "depends" as any, description: "test" },
        ],
      }),
    );
    expect(result.valid).toBe(false);
  });

  // -- Non-object input --

  it("rejects null input", () => {
    const result = validateSkillFrontmatter(null);
    expect(result.valid).toBe(false);
  });

  it("rejects string input", () => {
    const result = validateSkillFrontmatter("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects array input", () => {
    const result = validateSkillFrontmatter([]);
    expect(result.valid).toBe(false);
  });
});
