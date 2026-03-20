import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import {
  parseProtocolUrl,
  VALID_PACKAGE,
  VALID_ACTIONS,
  buildDialogMessage,
} from "../src/cli/commands/protocol-handle.js";
import { createTmpDir, removeTmpDir } from "./helpers.js";

// -- parseProtocolUrl --

describe("parseProtocolUrl", () => {
  it("parses spm://install/@core/docx", () => {
    const req = parseProtocolUrl("spm://install/@core/docx");
    expect(req.action).toBe("install");
    expect(req.target).toBe("@core/docx");
    expect(req.params).toEqual({});
  });

  it("parses spm://activate/@author/defi-analyst", () => {
    const req = parseProtocolUrl("spm://activate/@author/defi-analyst");
    expect(req.action).toBe("activate");
    expect(req.target).toBe("@author/defi-analyst");
  });

  it("parses spm://connect/claude", () => {
    const req = parseProtocolUrl("spm://connect/claude");
    expect(req.action).toBe("connect");
    expect(req.target).toBe("claude");
  });

  it("parses query params (version, instance)", () => {
    const req = parseProtocolUrl("spm://install/@core/docx?version=1.2.0&instance=work");
    expect(req.action).toBe("install");
    expect(req.target).toBe("@core/docx");
    expect(req.params.version).toBe("1.2.0");
    expect(req.params.instance).toBe("work");
  });

  it("parses nonce param", () => {
    const req = parseProtocolUrl("spm://install/@core/docx?nonce=abc123");
    expect(req.params.nonce).toBe("abc123");
  });

  it("decodes URL-encoded query values", () => {
    const req = parseProtocolUrl("spm://install/@core/docx?version=1.0.0-beta%2B1");
    expect(req.params.version).toBe("1.0.0-beta+1");
  });

  it("adds @ prefix if missing for install/activate", () => {
    const req = parseProtocolUrl("spm://install/core/docx");
    expect(req.target).toBe("@core/docx");
  });

  it("does not add @ prefix for connect", () => {
    const req = parseProtocolUrl("spm://connect/claude");
    expect(req.target).toBe("claude");
  });

  it("throws on URL with only action and no target", () => {
    expect(() => parseProtocolUrl("spm://install")).toThrow("expected action and target");
  });

  it("throws on empty URL", () => {
    expect(() => parseProtocolUrl("spm://")).toThrow("expected at least an action");
  });

  it("handles URL without spm:// prefix gracefully", () => {
    const req = parseProtocolUrl("install/@core/docx");
    expect(req.action).toBe("install");
    expect(req.target).toBe("@core/docx");
  });
});

// -- VALID_PACKAGE regex --

describe("VALID_PACKAGE", () => {
  it("accepts valid package names", () => {
    expect(VALID_PACKAGE.test("@core/docx")).toBe(true);
    expect(VALID_PACKAGE.test("@author/defi-analyst")).toBe(true);
    expect(VALID_PACKAGE.test("@my-org/my-skill")).toBe(true);
    expect(VALID_PACKAGE.test("@a/b")).toBe(true);
    expect(VALID_PACKAGE.test("@abc123/def456")).toBe(true);
  });

  it("rejects names without @ prefix", () => {
    expect(VALID_PACKAGE.test("core/docx")).toBe(false);
  });

  it("rejects names with uppercase", () => {
    expect(VALID_PACKAGE.test("@Core/Docx")).toBe(false);
  });

  it("rejects names with special characters", () => {
    expect(VALID_PACKAGE.test("@core/do.cx")).toBe(false);
    expect(VALID_PACKAGE.test("@core/do_cx")).toBe(false);
    expect(VALID_PACKAGE.test("@co re/docx")).toBe(false);
  });

  it("rejects path traversal attempts", () => {
    expect(VALID_PACKAGE.test("@../etc/passwd")).toBe(false);
    expect(VALID_PACKAGE.test("@core/../../etc")).toBe(false);
  });

  it("rejects names without slash separator", () => {
    expect(VALID_PACKAGE.test("@coredocx")).toBe(false);
  });

  it("rejects empty segments", () => {
    expect(VALID_PACKAGE.test("@/docx")).toBe(false);
    expect(VALID_PACKAGE.test("@core/")).toBe(false);
  });

  it("rejects command injection attempts", () => {
    expect(VALID_PACKAGE.test("@core/docx;rm -rf /")).toBe(false);
    expect(VALID_PACKAGE.test("@core/docx$(whoami)")).toBe(false);
    expect(VALID_PACKAGE.test("@core/docx`id`")).toBe(false);
  });
});

// -- VALID_ACTIONS --

describe("VALID_ACTIONS", () => {
  it("contains install, activate, connect", () => {
    expect(VALID_ACTIONS.has("install")).toBe(true);
    expect(VALID_ACTIONS.has("activate")).toBe(true);
    expect(VALID_ACTIONS.has("connect")).toBe(true);
  });

  it("rejects unknown actions", () => {
    expect(VALID_ACTIONS.has("delete")).toBe(false);
    expect(VALID_ACTIONS.has("exec")).toBe(false);
    expect(VALID_ACTIONS.has("run")).toBe(false);
    expect(VALID_ACTIONS.has("")).toBe(false);
  });
});

// -- buildDialogMessage --

describe("buildDialogMessage", () => {
  it("formats install message", () => {
    const msg = buildDialogMessage({ action: "install", target: "@core/docx", params: {} });
    expect(msg).toBe("Install skill @core/docx?");
  });

  it("formats install message with version", () => {
    const msg = buildDialogMessage({ action: "install", target: "@core/docx", params: { version: "2.0.0" } });
    expect(msg).toBe("Install skill @core/docx v2.0.0?");
  });

  it("formats activate message", () => {
    const msg = buildDialogMessage({ action: "activate", target: "@author/defi-analyst", params: {} });
    expect(msg).toBe("Activate persona @author/defi-analyst?");
  });

  it("formats connect message", () => {
    const msg = buildDialogMessage({ action: "connect", target: "claude", params: {} });
    expect(msg).toBe("Connect to claude?");
  });
});

// -- Rate limiting (filesystem-based) --

describe("rate limiting", () => {
  let tmpDir: string;
  let origHome: string;

  beforeEach(async () => {
    tmpDir = await createTmpDir();
    origHome = process.env.HOME!;
    process.env.HOME = tmpDir;
    await fs.mkdir(path.join(tmpDir, ".spm"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = origHome;
    await removeTmpDir(tmpDir);
  });

  it("rate limit file stores timestamps as JSON", async () => {
    const ratePath = path.join(tmpDir, ".spm", "protocol-rate.json");
    const state = { timestamps: [Date.now(), Date.now() + 1] };
    await fs.writeFile(ratePath, JSON.stringify(state), "utf-8");

    const raw = await fs.readFile(ratePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.timestamps).toHaveLength(2);
  });

  it("expired timestamps are filtered by window", () => {
    const now = Date.now();
    const window = 60_000;
    const timestamps = [now - 120_000, now - 90_000, now - 30_000, now - 10_000];
    const valid = timestamps.filter((t) => now - t < window);
    expect(valid).toHaveLength(2);
  });
});
