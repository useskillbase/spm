import { describe, it, expect, beforeEach } from "vitest";
import {
  checkPermission,
  buildPolicyBlock,
  recordAudit,
  getAuditLog,
  clearAuditLog,
} from "../src/mcp/permissions.js";
import type { LoadedSkillSession } from "../src/types/index.js";

function makeSkill(overrides: Partial<LoadedSkillSession> = {}): LoadedSkillSession {
  return {
    name: "test-skill",
    version: "1.0.0",
    tokens: 500,
    permissions: [],
    ...overrides,
  };
}

beforeEach(() => {
  clearAuditLog();
});

// ── checkPermission ─────────────────────────────────────────────────

describe("checkPermission", () => {
  it("denies when no skills are loaded", () => {
    const result = checkPermission([], "bash:execute");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("No skills loaded");
  });

  it("denies when permission is not granted", () => {
    const skills = [makeSkill({ permissions: ["file:read"] })];
    const result = checkPermission(skills, "bash:execute");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not granted");
  });

  it("allows when permission matches", () => {
    const skills = [makeSkill({ permissions: ["bash:execute"] })];
    const result = checkPermission(skills, "bash:execute");
    expect(result.allowed).toBe(true);
  });

  it("allows with tool:* wildcard", () => {
    const skills = [makeSkill({ permissions: ["tool:*"] })];
    const result = checkPermission(skills, "bash:execute");
    expect(result.allowed).toBe(true);
  });

  it("allows with tool:* wildcard for any permission", () => {
    const skills = [makeSkill({ permissions: ["tool:*"] })];
    expect(checkPermission(skills, "file:write").allowed).toBe(true);
    expect(checkPermission(skills, "network:allowlist").allowed).toBe(true);
    expect(checkPermission(skills, "file:delete").allowed).toBe(true);
  });

  it("unions permissions across multiple loaded skills", () => {
    const skills = [
      makeSkill({ name: "skill-a", permissions: ["bash:execute"] }),
      makeSkill({ name: "skill-b", permissions: ["file:write"] }),
    ];
    expect(checkPermission(skills, "bash:execute").allowed).toBe(true);
    expect(checkPermission(skills, "file:write").allowed).toBe(true);
    expect(checkPermission(skills, "network:allowlist").allowed).toBe(false);
  });

  it("returns the granting skill name", () => {
    const skills = [makeSkill({ name: "docx-gen", permissions: ["file:write"] })];
    const result = checkPermission(skills, "file:write");
    expect(result.skill).toBe("docx-gen");
  });
});

// ── file_scope validation ───────────────────────────────────────────

describe("file_scope", () => {
  it("allows path inside file_scope", () => {
    const skills = [makeSkill({
      permissions: ["file:write"],
      file_scope: ["/home/user/project"],
    })];
    const result = checkPermission(skills, "file:write", "/home/user/project/src/index.ts");
    expect(result.allowed).toBe(true);
  });

  it("denies path outside file_scope", () => {
    const skills = [makeSkill({
      permissions: ["file:write"],
      file_scope: ["/home/user/project"],
    })];
    const result = checkPermission(skills, "file:write", "/etc/passwd");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("outside allowed file_scope");
  });

  it("denies path traversal attack", () => {
    const skills = [makeSkill({
      permissions: ["file:write"],
      file_scope: ["/home/user/project"],
    })];
    const result = checkPermission(
      skills,
      "file:write",
      "/home/user/project/../../etc/passwd",
    );
    expect(result.allowed).toBe(false);
  });

  it("allows when no file_scope is declared (unrestricted)", () => {
    const skills = [makeSkill({ permissions: ["file:write"] })];
    const result = checkPermission(skills, "file:write", "/any/path/file.txt");
    expect(result.allowed).toBe(true);
  });

  it("allows when file_scope is empty array (unrestricted)", () => {
    const skills = [makeSkill({ permissions: ["file:write"], file_scope: [] })];
    const result = checkPermission(skills, "file:write", "/any/path/file.txt");
    expect(result.allowed).toBe(true);
  });

  it("allows exact scope directory match", () => {
    const skills = [makeSkill({
      permissions: ["file:read"],
      file_scope: ["/home/user/project"],
    })];
    const result = checkPermission(skills, "file:read", "/home/user/project");
    expect(result.allowed).toBe(true);
  });

  it("denies path that starts with scope but is not a subdirectory", () => {
    const skills = [makeSkill({
      permissions: ["file:write"],
      file_scope: ["/home/user/proj"],
    })];
    // /home/user/project starts with /home/user/proj but is NOT a subdirectory
    const result = checkPermission(skills, "file:write", "/home/user/project/file.txt");
    expect(result.allowed).toBe(false);
  });

  it("unions file_scope across multiple skills", () => {
    const skills = [
      makeSkill({ name: "a", permissions: ["file:write"], file_scope: ["/home/user/a"] }),
      makeSkill({ name: "b", permissions: ["file:write"], file_scope: ["/home/user/b"] }),
    ];
    expect(checkPermission(skills, "file:write", "/home/user/a/file.txt").allowed).toBe(true);
    expect(checkPermission(skills, "file:write", "/home/user/b/file.txt").allowed).toBe(true);
    expect(checkPermission(skills, "file:write", "/home/user/c/file.txt").allowed).toBe(false);
  });

  it("does not check file_scope when permission itself is denied", () => {
    const skills = [makeSkill({
      permissions: ["file:read"],
      file_scope: ["/home/user/project"],
    })];
    const result = checkPermission(skills, "file:write", "/home/user/project/file.txt");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not granted");
  });
});

// ── audit log ───────────────────────────────────────────────────────

describe("audit log", () => {
  it("records entries", () => {
    recordAudit({
      timestamp: "2026-01-01T00:00:00Z",
      skill: "test",
      tool: "skill_exec_bash",
      action: "echo hello",
      allowed: true,
      reason: "granted",
    });
    const log = getAuditLog();
    expect(log).toHaveLength(1);
    expect(log[0].tool).toBe("skill_exec_bash");
  });

  it("clears log", () => {
    recordAudit({
      timestamp: "2026-01-01T00:00:00Z",
      skill: "test",
      tool: "skill_exec_bash",
      action: "ls",
      allowed: true,
      reason: "granted",
    });
    clearAuditLog();
    expect(getAuditLog()).toHaveLength(0);
  });
});

// ── buildPolicyBlock ────────────────────────────────────────────────

describe("buildPolicyBlock", () => {
  it("marks authorized and denied tools", () => {
    const block = buildPolicyBlock(["file:read", "file:write"]);
    expect(block).toContain("<SKILL_POLICY>");
    expect(block).toContain("</SKILL_POLICY>");
    expect(block).toContain("skill_exec_read");
    expect(block).toContain("skill_exec_write");
    expect(block).toContain("USE THIS");
    expect(block).toContain("DENIED for this skill");
  });

  it("marks all tools as USE THIS with tool:*", () => {
    const block = buildPolicyBlock(["tool:*"]);
    expect(block).not.toContain("DENIED");
  });

  it("includes permission list", () => {
    const block = buildPolicyBlock(["bash:execute"]);
    expect(block).toContain("bash:execute");
  });
});
