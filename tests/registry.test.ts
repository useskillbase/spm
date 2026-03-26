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

  it("finds skill by short name (without author prefix)", () => {
    const index = makeIndex(
      makeEntry("skillbase/python-backend", 80),
      makeEntry("skillbase/ts", 70),
    );
    const found = findSkill(index, "python-backend");
    expect(found).toBeDefined();
    expect(found!.name).toBe("skillbase/python-backend");
  });

  it("prefers exact match over short name fallback", () => {
    const index = makeIndex(
      makeEntry("python-backend", 90),
      makeEntry("skillbase/python-backend", 80),
    );
    const found = findSkill(index, "python-backend");
    expect(found).toBeDefined();
    expect(found!.name).toBe("python-backend");
  });

  it("does not use short name fallback when name contains slash", () => {
    const index = makeIndex(makeEntry("skillbase/python-backend", 80));
    expect(findSkill(index, "other/python-backend")).toBeUndefined();
  });
});
