import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { LoadedSkillSession } from "../types/index.js";
import { checkPermission, recordAudit } from "./permissions.js";
import { addFeedback } from "../core/feedback.js";

// ── Helpers ─────────────────────────────────────────────────────────

function denied(reason: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: "permission_denied", reason }) }],
    isError: true,
  };
}

async function recordViolation(
  skills: readonly LoadedSkillSession[],
  tool: string,
  action: string,
  reason: string,
): Promise<void> {
  recordAudit({
    timestamp: new Date().toISOString(),
    skill: skills[0]?.name ?? "unknown",
    tool,
    action,
    allowed: false,
    reason,
  });

  if (skills.length > 0) {
    const skill = skills[0];
    try {
      await addFeedback(skill.name, skill.version, "violation", "automatic", {
        comment: `${tool}: ${reason}`,
      });
    } catch {
      // ignore – recording violation is best-effort
    }
  }
}

function recordAllowed(
  skills: readonly LoadedSkillSession[],
  tool: string,
  action: string,
): void {
  recordAudit({
    timestamp: new Date().toISOString(),
    skill: skills[0]?.name ?? "unknown",
    tool,
    action,
    allowed: true,
    reason: "Permission granted",
  });
}

// ── Registration ────────────────────────────────────────────────────

export function registerProxyTools(
  server: McpServer,
  loadedSkills: LoadedSkillSession[],
): void {
  registerExecBash(server, loadedSkills);
  registerExecWrite(server, loadedSkills);
  registerExecRead(server, loadedSkills);
  registerExecFetch(server, loadedSkills);
}

// ── skill_exec_bash ─────────────────────────────────────────────────

function registerExecBash(
  server: McpServer,
  loadedSkills: LoadedSkillSession[],
): void {
  server.tool(
    "skill_exec_bash",
    "Execute a shell command with permission enforcement. Only works if the active skill declares 'bash:execute' permission. Use this instead of native Bash tool when following skill instructions.",
    {
      command: z.string().describe("Shell command to execute"),
      timeout_ms: z
        .number()
        .int()
        .min(1000)
        .max(120_000)
        .optional()
        .default(30_000)
        .describe("Execution timeout in milliseconds (default 30s, max 120s)"),
    },
    async ({ command, timeout_ms }) => {
      const check = checkPermission(loadedSkills, "bash:execute");

      if (!check.allowed) {
        await recordViolation(loadedSkills, "skill_exec_bash", command, check.reason);
        return denied(check.reason);
      }

      recordAllowed(loadedSkills, "skill_exec_bash", command);

      try {
        const result = await execShell(command, timeout_ms);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              stdout: result.stdout,
              stderr: result.stderr,
              exit_code: result.exitCode,
            }),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "execution_failed", reason: message }) }],
          isError: true,
        };
      }
    },
  );
}

function execShell(
  command: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "/bin/sh",
      ["-c", command],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && !("code" in error)) {
          reject(error);
          return;
        }
        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          exitCode: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
        });
      },
    );

    child.on("error", reject);
  });
}

// ── skill_exec_write ────────────────────────────────────────────────

function registerExecWrite(
  server: McpServer,
  loadedSkills: LoadedSkillSession[],
): void {
  server.tool(
    "skill_exec_write",
    "Write content to a file with permission enforcement. Only works if the active skill declares 'file:write' permission. Validates path against file_scope if declared. Use this instead of native Write tool.",
    {
      path: z.string().describe("Absolute path to write to"),
      content: z.string().describe("File content to write"),
    },
    async ({ path: filePath, content }) => {
      const check = checkPermission(loadedSkills, "file:write", filePath);

      if (!check.allowed) {
        await recordViolation(loadedSkills, "skill_exec_write", filePath, check.reason);
        return denied(check.reason);
      }

      recordAllowed(loadedSkills, "skill_exec_write", filePath);

      try {
        const resolved = path.resolve(filePath);
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");
        const stats = await fs.stat(resolved);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ written: true, path: resolved, bytes: stats.size }),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "write_failed", reason: message }) }],
          isError: true,
        };
      }
    },
  );
}

// ── skill_exec_read ─────────────────────────────────────────────────

function registerExecRead(
  server: McpServer,
  loadedSkills: LoadedSkillSession[],
): void {
  server.tool(
    "skill_exec_read",
    "Read a file with permission enforcement. Only works if the active skill declares 'file:read' permission. Validates path against file_scope if declared. Use this instead of native Read tool.",
    {
      path: z.string().describe("Absolute path to read"),
    },
    async ({ path: filePath }) => {
      const check = checkPermission(loadedSkills, "file:read", filePath);

      if (!check.allowed) {
        await recordViolation(loadedSkills, "skill_exec_read", filePath, check.reason);
        return denied(check.reason);
      }

      recordAllowed(loadedSkills, "skill_exec_read", filePath);

      try {
        const resolved = path.resolve(filePath);
        const content = await fs.readFile(resolved, "utf-8");
        return {
          content: [{ type: "text" as const, text: content }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "read_failed", reason: message }) }],
          isError: true,
        };
      }
    },
  );
}

// ── skill_exec_fetch ────────────────────────────────────────────────

function registerExecFetch(
  server: McpServer,
  loadedSkills: LoadedSkillSession[],
): void {
  server.tool(
    "skill_exec_fetch",
    "Make an HTTP request with permission enforcement. Only works if the active skill declares 'network:allowlist' permission. Use this instead of native fetch/curl.",
    {
      url: z.string().url().describe("URL to fetch"),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .optional()
        .default("GET")
        .describe("HTTP method"),
      body: z.string().optional().describe("Request body (for POST/PUT/PATCH)"),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe("Request headers as key-value pairs"),
    },
    async ({ url, method, body, headers }) => {
      const check = checkPermission(loadedSkills, "network:allowlist");

      if (!check.allowed) {
        await recordViolation(loadedSkills, "skill_exec_fetch", url, check.reason);
        return denied(check.reason);
      }

      recordAllowed(loadedSkills, "skill_exec_fetch", url);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        const response = await fetch(url, {
          method,
          body: body ?? undefined,
          headers: headers ?? undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const responseBody = await response.text();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              status: response.status,
              headers: responseHeaders,
              body: responseBody,
            }),
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "fetch_failed", reason: message }) }],
          isError: true,
        };
      }
    },
  );
}
