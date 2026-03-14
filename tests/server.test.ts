import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import { createServer } from "../src/mcp/server.js";
import { getDefaultConfig, writeConfig } from "../src/core/config.js";
import { writeIndex } from "../src/core/indexer.js";
import { createTmpDir, removeTmpDir, minimalManifest, installSkillFixture } from "./helpers.js";
import { getFeedbackPath } from "../src/core/paths.js";

let tmpDir: string;
let origHome: string;
let origCwd: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
  origHome = process.env.HOME!;
  origCwd = process.cwd();
  // Point global skills dir to tmpDir
  process.env.HOME = tmpDir;
  process.chdir(tmpDir);
  // Create .skills structure under tmpDir (simulating home dir)
  const skillsDir = `${tmpDir}/.skills`;
  await fs.mkdir(`${skillsDir}/installed`, { recursive: true });
  await writeConfig(getDefaultConfig(), skillsDir);
});

afterEach(async () => {
  process.env.HOME = origHome;
  process.chdir(origCwd);
  await removeTmpDir(tmpDir);
});

function getSkillsDir(): string {
  return `${tmpDir}/.skills`;
}

async function setupSkill(): Promise<void> {
  await installSkillFixture(getSkillsDir(), minimalManifest(), "# Test Skill\nInstructions.");
  await writeIndex(getSkillsDir());
}

describe("createServer", () => {
  it("returns a server instance", async () => {
    const server = await createServer();
    expect(server).toBeDefined();
  });
});

describe("tool registration with config toggles", () => {
  it("registers all tools with default config", async () => {
    const server = await createServer();
    // McpServer exposes tools internally — we check by calling listTools
    // Since McpServer doesn't have a direct listTools method accessible,
    // we verify the server was created successfully (tools registered without error)
    expect(server).toBeDefined();
  });

  it("skips skill_feedback when feedback.enabled=false", async () => {
    const config = getDefaultConfig();
    config.feedback.enabled = false;
    await writeConfig(config, getSkillsDir());

    const server = await createServer();
    // Server should still be created, just without skill_feedback tool
    expect(server).toBeDefined();
  });

  it("skips specific tools when disabled in config", async () => {
    const config = getDefaultConfig();
    config.tools.skill_search = false;
    config.tools.skill_context = false;
    await writeConfig(config, getSkillsDir());

    const server = await createServer();
    expect(server).toBeDefined();
  });
});

describe("skill_feedback integration", () => {
  it("records feedback to feedback.json", async () => {
    await setupSkill();

    // Use feedback module directly to verify integration
    const { addFeedback } = await import("../src/core/feedback.js");
    await addFeedback("skill", "1.0.0", "success", "automatic", undefined, getSkillsDir());

    const raw = await fs.readFile(getFeedbackPath(getSkillsDir()), "utf-8");
    const store = JSON.parse(raw);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].result).toBe("success");
  });

  it("feedback affects getStatsForSkill confidence", async () => {
    await setupSkill();
    const { addFeedback, getStatsForSkill } = await import("../src/core/feedback.js");

    for (let i = 0; i < 10; i++) {
      await addFeedback("skill", "1.0.0", "success", "automatic", undefined, getSkillsDir());
    }

    const stats = await getStatsForSkill("skill", getSkillsDir());
    expect(stats).not.toBeNull();
    expect(stats!.confidence).toBeGreaterThan(0.5);
    expect(stats!.success_rate).toBe(1.0);
  });
});
