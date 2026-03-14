import { describe, it, expect } from "vitest";
import { validateSkillManifest } from "../src/schema/skill-schema.js";
import { minimalManifest } from "./helpers.js";

describe("validateSkillManifest", () => {
  it("accepts a valid minimal manifest", () => {
    const result = validateSkillManifest(minimalManifest());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts manifest with all optional fields", () => {
    const manifest = minimalManifest({
      compact_entry: "SKILL.compact.md",
      files: {
        reference: ["ref.md"],
        examples: ["example.py"],
        assets: ["logo.png"],
        tests: ["test.md"],
      },
      works_with: [
        { skill: "@core/xlsx", relationship: "parallel", description: "Companion" },
      ],
      quality: {
        usage_count: 10,
        success_rate: 0.9,
        avg_rating: 4.5,
        confidence: 0.8,
      },
      repository: "https://github.com/test/skill",
    });
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(true);
  });

  // -- Name validation --

  it("accepts simple lowercase name", () => {
    const result = validateSkillManifest(minimalManifest({ name: "my-skill" as any }));
    expect(result.valid).toBe(true);
  });

  it("rejects name with @ prefix", () => {
    const result = validateSkillManifest(minimalManifest({ name: "@scope/skill" as any }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects name with slash", () => {
    const result = validateSkillManifest(minimalManifest({ name: "author/skill" as any }));
    expect(result.valid).toBe(false);
  });

  it("rejects name with uppercase", () => {
    const result = validateSkillManifest(minimalManifest({ name: "MySkill" as any }));
    expect(result.valid).toBe(false);
  });

  it("rejects name with special characters", () => {
    const result = validateSkillManifest(minimalManifest({ name: "skill_v2" as any }));
    expect(result.valid).toBe(false);
  });

  it("rejects name starting with hyphen", () => {
    const result = validateSkillManifest(minimalManifest({ name: "-skill" as any }));
    expect(result.valid).toBe(false);
  });

  // -- Version validation --

  it("rejects non-semver version", () => {
    const result = validateSkillManifest(minimalManifest({ version: "v1" }));
    expect(result.valid).toBe(false);
  });

  it("accepts semver with prerelease", () => {
    const result = validateSkillManifest(minimalManifest({ version: "1.0.0-beta.1" }));
    expect(result.valid).toBe(true);
  });

  // -- Trigger validation --

  it("rejects empty tags array", () => {
    const result = validateSkillManifest(
      minimalManifest({ trigger: { description: "test", tags: [], priority: 50 } }),
    );
    expect(result.valid).toBe(false);
  });

  it("rejects priority out of range", () => {
    const over = validateSkillManifest(
      minimalManifest({ trigger: { description: "test", tags: ["t"], priority: 101 } }),
    );
    expect(over.valid).toBe(false);

    const under = validateSkillManifest(
      minimalManifest({ trigger: { description: "test", tags: ["t"], priority: -1 } }),
    );
    expect(under.valid).toBe(false);
  });

  it("accepts priority at boundaries (0 and 100)", () => {
    const zero = validateSkillManifest(
      minimalManifest({ trigger: { description: "test", tags: ["t"], priority: 0 } }),
    );
    expect(zero.valid).toBe(true);

    const hundred = validateSkillManifest(
      minimalManifest({ trigger: { description: "test", tags: ["t"], priority: 100 } }),
    );
    expect(hundred.valid).toBe(true);
  });

  // -- Missing required fields --

  it("rejects when required fields are missing", () => {
    const result = validateSkillManifest({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects empty description", () => {
    const result = validateSkillManifest(minimalManifest({ description: "" }));
    expect(result.valid).toBe(false);
  });

  // -- Language --

  it("rejects non-English language", () => {
    const result = validateSkillManifest(minimalManifest({ language: "ru" as any }));
    expect(result.valid).toBe(false);
  });

  // -- Quality bounds --

  it("rejects quality with out-of-range values", () => {
    const result = validateSkillManifest(
      minimalManifest({
        quality: { usage_count: -1, success_rate: 1.5, avg_rating: 6, confidence: -0.1 },
      }),
    );
    expect(result.valid).toBe(false);
  });

  // -- Additional properties --

  it("rejects unknown top-level properties", () => {
    const manifest = { ...minimalManifest(), unknown_field: "value" };
    const result = validateSkillManifest(manifest);
    expect(result.valid).toBe(false);
  });

  // -- works_with relationship enum --

  it("rejects invalid works_with relationship", () => {
    const result = validateSkillManifest(
      minimalManifest({
        works_with: [
          { skill: "@test/x", relationship: "depends" as any, description: "test" },
        ],
      }),
    );
    expect(result.valid).toBe(false);
  });

  // -- Non-object input --

  it("rejects null input", () => {
    const result = validateSkillManifest(null);
    expect(result.valid).toBe(false);
  });

  it("rejects string input", () => {
    const result = validateSkillManifest("not an object");
    expect(result.valid).toBe(false);
  });

  it("rejects array input", () => {
    const result = validateSkillManifest([]);
    expect(result.valid).toBe(false);
  });
});
