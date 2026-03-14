import { describe, it, expect } from "vitest";
import { findSkill } from "../src/core/registry.js";
import type { SkillIndex, IndexSkillEntry } from "../src/types/index.js";

function makeEntry(name: string, priority: number): IndexSkillEntry {
  return {
    name,
    v: "1.0.0",
    trigger: `Trigger for ${name}`,
    tags: ["test"],
    priority,
    entry: `/path/to/${name}/SKILL.md`,
    tokens_estimate: 100,
  };
}

function makeIndex(...entries: IndexSkillEntry[]): SkillIndex {
  return { version: "1.0.0", skills: entries };
}

describe("findSkill", () => {
  it("finds skill by exact name", () => {
    const index = makeIndex(makeEntry("docx", 80), makeEntry("xlsx", 70));
    const found = findSkill(index, "docx");
    expect(found).toBeDefined();
    expect(found!.name).toBe("docx");
  });

  it("returns undefined for non-existent skill", () => {
    const index = makeIndex(makeEntry("docx", 80));
    expect(findSkill(index, "missing")).toBeUndefined();
  });

  it("returns undefined for empty index", () => {
    const index = makeIndex();
    expect(findSkill(index, "docx")).toBeUndefined();
  });

  it("does not match partial names", () => {
    const index = makeIndex(makeEntry("docx", 80));
    expect(findSkill(index, "doc")).toBeUndefined();
    expect(findSkill(index, "docx-extra")).toBeUndefined();
  });
});
