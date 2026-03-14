import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import {
  addFeedback,
  getEntriesForSkill,
  getAllStats,
  getStatsForSkill,
  calculateConfidence,
} from "../src/core/feedback.js";
import { getFeedbackPath } from "../src/core/paths.js";
import { createTmpDir, removeTmpDir } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

describe("calculateConfidence", () => {
  it("returns 0 for zero usage", () => {
    expect(calculateConfidence(1.0, 0)).toBe(0);
  });

  it("returns low confidence for single use even with 100% success", () => {
    const c = calculateConfidence(1.0, 1);
    expect(c).toBeLessThan(0.25);
    expect(c).toBeGreaterThan(0);
  });

  it("caps at success_rate for 32+ uses", () => {
    const c = calculateConfidence(0.8, 32);
    expect(c).toBeCloseTo(0.8, 1);
  });

  it("returns 0 for zero success rate regardless of usage", () => {
    expect(calculateConfidence(0, 100)).toBe(0);
  });

  it("scales proportionally between 1 and 32 uses", () => {
    const c5 = calculateConfidence(1.0, 5);
    const c15 = calculateConfidence(1.0, 15);
    const c31 = calculateConfidence(1.0, 31);
    expect(c5).toBeLessThan(c15);
    expect(c15).toBeLessThan(c31);
  });

  it("handles very large usage counts", () => {
    const c = calculateConfidence(0.9, 10000);
    expect(c).toBeCloseTo(0.9, 1);
  });
});

describe("addFeedback", () => {
  it("creates feedback.json if not exists", async () => {
    await addFeedback("skill", "1.0.0", "success", "automatic", undefined, tmpDir);
    const raw = await fs.readFile(getFeedbackPath(tmpDir), "utf-8");
    const store = JSON.parse(raw);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].skill).toBe("skill");
    expect(store.entries[0].result).toBe("success");
    expect(store.entries[0].type).toBe("automatic");
  });

  it("appends to existing entries", async () => {
    await addFeedback("a", "1.0.0", "success", "automatic", undefined, tmpDir);
    await addFeedback("b", "2.0.0", "failure", "explicit", undefined, tmpDir);
    const raw = await fs.readFile(getFeedbackPath(tmpDir), "utf-8");
    const store = JSON.parse(raw);
    expect(store.entries).toHaveLength(2);
  });

  it("stores optional fields when provided", async () => {
    const entry = await addFeedback("skill", "1.0.0", "partial", "explicit", {
      rating: 4,
      comment: "Pretty good",
      task_type: "create",
      file_types: [".docx"],
      tokens_used: 500,
    }, tmpDir);
    expect(entry.rating).toBe(4);
    expect(entry.comment).toBe("Pretty good");
    expect(entry.context?.task_type).toBe("create");
    expect(entry.context?.file_types).toEqual([".docx"]);
    expect(entry.context?.tokens_used).toBe(500);
  });

  it("omits optional fields when not provided", async () => {
    const entry = await addFeedback("skill", "1.0.0", "failure", "automatic", undefined, tmpDir);
    expect(entry.rating).toBeUndefined();
    expect(entry.comment).toBeUndefined();
    expect(entry.context).toBeUndefined();
  });

  it("generates valid ISO timestamp", async () => {
    const entry = await addFeedback("skill", "1.0.0", "success", "automatic", undefined, tmpDir);
    const date = new Date(entry.timestamp);
    expect(date.toISOString()).toBe(entry.timestamp);
  });
});

describe("getEntriesForSkill", () => {
  it("returns empty array for unknown skill", async () => {
    const entries = await getEntriesForSkill("nonexistent-skill", tmpDir);
    expect(entries).toEqual([]);
  });

  it("filters entries by skill name", async () => {
    await addFeedback("a", "1.0.0", "success", "automatic", undefined, tmpDir);
    await addFeedback("b", "1.0.0", "failure", "automatic", undefined, tmpDir);
    await addFeedback("a", "1.0.0", "partial", "explicit", undefined, tmpDir);

    const entries = await getEntriesForSkill("a", tmpDir);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.skill === "a")).toBe(true);
  });
});

describe("getStatsForSkill", () => {
  it("returns null for skill with no feedback", async () => {
    const stats = await getStatsForSkill("none", tmpDir);
    expect(stats).toBeNull();
  });

  it("computes correct success_rate (success + partial count as success)", async () => {
    await addFeedback("s", "1.0.0", "success", "automatic", undefined, tmpDir);
    await addFeedback("s", "1.0.0", "partial", "automatic", undefined, tmpDir);
    await addFeedback("s", "1.0.0", "failure", "automatic", undefined, tmpDir);
    await addFeedback("s", "1.0.0", "false_trigger", "automatic", undefined, tmpDir);

    const stats = await getStatsForSkill("s", tmpDir);
    expect(stats).not.toBeNull();
    expect(stats!.usage_count).toBe(4);
    expect(stats!.success_rate).toBe(0.5); // 2 out of 4
  });

  it("computes avg_rating only from rated entries", async () => {
    await addFeedback("s", "1.0.0", "success", "automatic", undefined, tmpDir);
    await addFeedback("s", "1.0.0", "success", "explicit", { rating: 5 }, tmpDir);
    await addFeedback("s", "1.0.0", "partial", "explicit", { rating: 3 }, tmpDir);

    const stats = await getStatsForSkill("s", tmpDir);
    expect(stats!.avg_rating).toBe(4); // (5+3)/2
  });

  it("returns null avg_rating when no entries are rated", async () => {
    await addFeedback("s", "1.0.0", "success", "automatic", undefined, tmpDir);
    const stats = await getStatsForSkill("s", tmpDir);
    expect(stats!.avg_rating).toBeNull();
  });
});

describe("getAllStats", () => {
  it("returns empty array when no feedback exists", async () => {
    const stats = await getAllStats(tmpDir);
    expect(stats).toEqual([]);
  });

  it("groups by skill and sorts by confidence descending", async () => {
    // Skill A: 10 successes → high confidence
    for (let i = 0; i < 10; i++) {
      await addFeedback("a", "1.0.0", "success", "automatic", undefined, tmpDir);
    }
    // Skill B: 2 failures → low confidence
    await addFeedback("b", "1.0.0", "failure", "automatic", undefined, tmpDir);
    await addFeedback("b", "1.0.0", "failure", "automatic", undefined, tmpDir);

    const stats = await getAllStats(tmpDir);
    expect(stats).toHaveLength(2);
    expect(stats[0].skill).toBe("a");
    expect(stats[0].confidence).toBeGreaterThan(stats[1].confidence);
  });

  it("handles corrupted feedback.json gracefully", async () => {
    await fs.writeFile(getFeedbackPath(tmpDir), "not json", "utf-8");
    const stats = await getAllStats(tmpDir);
    expect(stats).toEqual([]);
  });
});
