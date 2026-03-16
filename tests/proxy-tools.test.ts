import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  checkPermission,
  clearAuditLog,
  getAuditLog,
  recordAudit,
} from "../src/mcp/permissions.js";
import type { LoadedSkillSession } from "../src/types/index.js";
import { createTmpDir, removeTmpDir } from "./helpers.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
  clearAuditLog();
});

afterEach(async () => {
  await removeTmpDir(tmpDir);
});

function makeSession(overrides: Partial<LoadedSkillSession> = {}): LoadedSkillSession {
  return {
    name: "test-skill",
    version: "1.0.0",
    tokens: 500,
    permissions: [],
    ...overrides,
  };
}

// ── Permission checks for each proxy tool scenario ──────────────────

describe("skill_exec_bash permission checks", () => {
  it("allows when bash:execute is granted", () => {
    const skills = [makeSession({ permissions: ["bash:execute"] })];
    const check = checkPermission(skills, "bash:execute");
    expect(check.allowed).toBe(true);
  });

  it("denies when bash:execute is not granted", () => {
    const skills = [makeSession({ permissions: ["file:read"] })];
    const check = checkPermission(skills, "bash:execute");
    expect(check.allowed).toBe(false);
  });

  it("allows with tool:* wildcard", () => {
    const skills = [makeSession({ permissions: ["tool:*"] })];
    const check = checkPermission(skills, "bash:execute");
    expect(check.allowed).toBe(true);
  });
});

describe("skill_exec_write permission checks", () => {
  it("allows write within file_scope", () => {
    const skills = [makeSession({
      permissions: ["file:write"],
      file_scope: [tmpDir],
    })];
    const filePath = path.join(tmpDir, "output.txt");
    const check = checkPermission(skills, "file:write", filePath);
    expect(check.allowed).toBe(true);
  });

  it("denies write outside file_scope", () => {
    const skills = [makeSession({
      permissions: ["file:write"],
      file_scope: [tmpDir],
    })];
    const check = checkPermission(skills, "file:write", "/etc/shadow");
    expect(check.allowed).toBe(false);
  });

  it("denies when file:write not granted", () => {
    const skills = [makeSession({ permissions: ["file:read"] })];
    const check = checkPermission(skills, "file:write", path.join(tmpDir, "file.txt"));
    expect(check.allowed).toBe(false);
  });

  it("allows write without file_scope (unrestricted)", () => {
    const skills = [makeSession({ permissions: ["file:write"] })];
    const check = checkPermission(skills, "file:write", "/any/path.txt");
    expect(check.allowed).toBe(true);
  });
});

describe("skill_exec_read permission checks", () => {
  it("allows read with file:read permission", () => {
    const skills = [makeSession({ permissions: ["file:read"] })];
    const check = checkPermission(skills, "file:read", path.join(tmpDir, "test.txt"));
    expect(check.allowed).toBe(true);
  });

  it("denies read without file:read permission", () => {
    const skills = [makeSession({ permissions: ["bash:execute"] })];
    const check = checkPermission(skills, "file:read", path.join(tmpDir, "test.txt"));
    expect(check.allowed).toBe(false);
  });

  it("denies read outside file_scope", () => {
    const skills = [makeSession({
      permissions: ["file:read"],
      file_scope: [tmpDir],
    })];
    const check = checkPermission(skills, "file:read", "/etc/passwd");
    expect(check.allowed).toBe(false);
  });
});

describe("skill_exec_fetch permission checks", () => {
  it("allows fetch with network:allowlist", () => {
    const skills = [makeSession({ permissions: ["network:allowlist"] })];
    const check = checkPermission(skills, "network:allowlist");
    expect(check.allowed).toBe(true);
  });

  it("denies fetch with network:none", () => {
    const skills = [makeSession({ permissions: ["network:none"] })];
    const check = checkPermission(skills, "network:allowlist");
    expect(check.allowed).toBe(false);
  });

  it("denies fetch with no network permission", () => {
    const skills = [makeSession({ permissions: ["file:read"] })];
    const check = checkPermission(skills, "network:allowlist");
    expect(check.allowed).toBe(false);
  });
});

// ── No skills loaded scenario ───────────────────────────────────────

describe("no skills loaded", () => {
  it("denies all operations", () => {
    expect(checkPermission([], "bash:execute").allowed).toBe(false);
    expect(checkPermission([], "file:read").allowed).toBe(false);
    expect(checkPermission([], "file:write").allowed).toBe(false);
    expect(checkPermission([], "network:allowlist").allowed).toBe(false);
  });
});

// ── Audit trail ─────────────────────────────────────────────────────

describe("audit trail integration", () => {
  it("records audit entry for allowed action", () => {
    const skills = [makeSession({ permissions: ["bash:execute"] })];
    const check = checkPermission(skills, "bash:execute");

    recordAudit({
      timestamp: new Date().toISOString(),
      skill: skills[0].name,
      tool: "skill_exec_bash",
      action: "echo hello",
      allowed: check.allowed,
      reason: check.reason,
    });

    const log = getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].allowed).toBe(true);
    expect(log[0].tool).toBe("skill_exec_bash");
  });

  it("records audit entry for denied action", () => {
    const skills = [makeSession({ permissions: ["file:read"] })];
    const check = checkPermission(skills, "bash:execute");

    recordAudit({
      timestamp: new Date().toISOString(),
      skill: skills[0].name,
      tool: "skill_exec_bash",
      action: "rm -rf /",
      allowed: check.allowed,
      reason: check.reason,
    });

    const log = getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].allowed).toBe(false);
  });
});

// ── File operations with real filesystem ────────────────────────────

describe("file operations integration", () => {
  it("write permission + scope allows creating files", async () => {
    const skills = [makeSession({
      permissions: ["file:write"],
      file_scope: [tmpDir],
    })];
    const filePath = path.join(tmpDir, "subdir", "test.txt");

    const check = checkPermission(skills, "file:write", filePath);
    expect(check.allowed).toBe(true);

    // Actually write the file (simulating what proxy tool does)
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "test content", "utf-8");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("test content");
  });

  it("read permission allows reading existing files", async () => {
    const skills = [makeSession({
      permissions: ["file:read"],
      file_scope: [tmpDir],
    })];
    const filePath = path.join(tmpDir, "readable.txt");
    await fs.writeFile(filePath, "hello", "utf-8");

    const check = checkPermission(skills, "file:read", filePath);
    expect(check.allowed).toBe(true);

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("hello");
  });
});
