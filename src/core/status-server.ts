import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSkillsDir, getStatusPortPath, getStatusPidPath } from "./paths.js";
import { listConnections } from "./connections.js";
import { getInstalledMap } from "./indexer.js";
import { readConfig } from "./config.js";
import { installSkill, removeSkill, publishSkill } from "./actions.js";
import type { InstalledMap } from "./indexer.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const DEFAULT_PORT = 57321;
const DEFAULT_HOST = "127.0.0.1";
const NONCE_TTL_MS = 120_000; // 2 minutes
const NONCE_MAX = 100;
const TASK_TTL_MS = 300_000; // 5 minutes
const MAX_CONCURRENT_TASKS = 3;
const PACKAGE_NAME_RE = /^@[a-z0-9-]+\/[a-z0-9-]+$/;
const VALID_ACTIONS = new Set(["install", "update", "remove", "publish", "sync-connect", "sync-project"]);

const CORS_ALLOWLIST = new Set([
  "https://skillbase.space",
  "https://studio.skillbase.space",
  "https://sync.skillbase.space",
  // Local dev — safe: only code on the same machine can send these origins
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
]);

// In-memory nonce store for challenge-response protocol verification
const nonceStore = new Map<string, number>(); // nonce → created_at timestamp

// In-memory task store for action tracking
export interface ActionTask {
  id: string;
  action: string;
  package: string;
  target: string;
  content?: string;
  filename?: string;
  status: "pending" | "in_progress" | "success" | "error";
  step: string | null;
  step_label: string | null;
  error: string | null;
  created_at: number;
}

const taskStore = new Map<string, ActionTask>();

export interface StatusServerOptions {
  port?: number;
  host?: string;
}

export interface StatusResponse {
  spm_version: string;
  author_name: string | null;
  connections: Array<{
    name: string;
    type: string;
    label: string;
    has_token: boolean;
  }>;
  installed: InstalledMap;
}

function setCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && CORS_ALLOWLIST.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
}

/**
 * Block cross-origin mutations from browsers.
 * Sec-Fetch-Site is set automatically by browsers and cannot be spoofed.
 * "same-origin" = same host, "none" = direct navigation/CLI, both safe.
 * "cross-site" / "same-site" = another website trying to hit our API.
 */
function isAllowedMutation(req: http.IncomingMessage): boolean {
  const secFetchSite = req.headers["sec-fetch-site"] as string | undefined;
  // Non-browser clients (curl, Node.js) don't send Sec-Fetch-Site — allow
  if (!secFetchSite) return true;
  // Allow same-origin and direct navigation
  if (secFetchSite === "same-origin" || secFetchSite === "none") return true;
  // Cross-origin browser request — only allow from CORS allowlist
  const origin = req.headers.origin;
  return !!origin && CORS_ALLOWLIST.has(origin);
}

function jsonResponse(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function pruneExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, created] of nonceStore) {
    if (now - created > NONCE_TTL_MS) {
      nonceStore.delete(nonce);
    }
  }
}

function pruneExpiredTasks(): void {
  const now = Date.now();
  for (const [id, task] of taskStore) {
    if (now - task.created_at > TASK_TTL_MS) {
      taskStore.delete(id);
    }
  }
}

function activeTasks(): number {
  let count = 0;
  for (const task of taskStore.values()) {
    if (task.status === "pending" || task.status === "in_progress") count++;
  }
  return count;
}

async function executeTask(task: ActionTask): Promise<void> {
  task.status = "in_progress";

  const onStep = (step: string, label: string) => {
    task.step = step;
    task.step_label = label;
  };

  try {
    if (task.action === "install" || task.action === "update") {
      await installSkill(task.package, undefined, onStep);
    } else if (task.action === "remove") {
      await removeSkill(task.package, onStep);
    } else if (task.action === "publish") {
      const result = await publishSkill({
        content: task.content!,
        filename: task.filename,
      }, onStep);
      task.package = `@${result.name}`;
    } else if (task.action === "sync-connect") {
      await executeSyncConnect(task, onStep);
    } else if (task.action === "sync-project") {
      await executeSyncProject(task, onStep);
    }
    task.status = "success";
  } catch (err) {
    task.status = "error";
    task.error = err instanceof Error ? err.message : String(err);
  }
}

/**
 * sync-connect: exchange session token for API key, save to config.
 * Task content is JSON: { api, session_token, company }
 */
async function executeSyncConnect(
  task: ActionTask,
  onStep: (step: string, label: string) => void,
): Promise<void> {
  const payload = JSON.parse(task.content ?? "{}") as {
    api?: string;
    session_token?: string;
    company?: string;
  };

  if (!payload.api || !payload.session_token || !payload.company) {
    throw new Error("Missing api, session_token, or company in sync-connect payload");
  }

  onStep("exchange", "Exchanging session token for API key...");

  // Exchange session token for API key
  const exchangeRes = await fetch(`${payload.api}/api/v1/auth/keys/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_token: payload.session_token,
      company_slug: payload.company,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!exchangeRes.ok) {
    const text = await exchangeRes.text().catch(() => "");
    throw new Error(`Token exchange failed (${exchangeRes.status}): ${text.slice(0, 200)}`);
  }

  const exchangeData = await exchangeRes.json() as { api_key: string };

  onStep("save", "Saving connection to config...");

  // Save to config
  const config = await readConfig();
  if (!config.sync) {
    config.sync = { connections: [] };
  }

  // Replace existing connection for this company, or add new
  const existing = config.sync.connections.findIndex(
    (c) => c.company === payload.company,
  );
  const connection = {
    company: payload.company!,
    api: payload.api!,
    key: exchangeData.api_key,
    connected_at: new Date().toISOString(),
  };

  if (existing >= 0) {
    config.sync.connections[existing] = connection;
  } else {
    config.sync.connections.push(connection);
  }

  config.sync.active_connection = payload.company;

  const { writeConfig } = await import("./config.js");
  await writeConfig(config);
}

/**
 * sync-project: install missing skills/personas from manifest.
 * Task content is JSON: { skills: [{name, version}], personas: [{name, version}] }
 */
async function executeSyncProject(
  task: ActionTask,
  onStep: (step: string, label: string) => void,
): Promise<void> {
  const payload = JSON.parse(task.content ?? "{}") as {
    skills?: Array<{ name: string; version: string }>;
    personas?: Array<{ name: string; version: string }>;
  };

  const skills = payload.skills ?? [];
  const personas = payload.personas ?? [];
  const all = [
    ...skills.map((s) => ({ ...s, type: "skill" as const })),
    ...personas.map((p) => ({ ...p, type: "persona" as const })),
  ];

  if (all.length === 0) {
    return; // nothing to do
  }

  // Check what's already installed
  const installed = await getInstalledMap();
  const toInstall = all.filter((pkg) => {
    const map = pkg.type === "persona" ? installed.personas : installed.skills;
    return !map[pkg.name];
  });

  if (toInstall.length === 0) {
    onStep("done", "Everything up to date");
    return;
  }

  let completed = 0;
  for (const pkg of toInstall) {
    completed++;
    onStep(
      `install-${completed}`,
      `Installing ${pkg.name} (${completed}/${toInstall.length})...`,
    );
    await installSkill(
      pkg.name,
      pkg.version === "latest" ? undefined : pkg.version,
    );
  }
}

export function createStatusServer(): http.Server {
  return http.createServer(async (req, res) => {
    setCorsHeaders(req, res);

    // Preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/status") {
      try {
        const [connections, installed, config] = await Promise.all([
          listConnections(),
          getInstalledMap(),
          readConfig(),
        ]);
        const defaultRegistry = config.scopes["*"];
        const reg = defaultRegistry ? config.registries.find((r) => r.name === defaultRegistry) : undefined;
        const response: StatusResponse = {
          spm_version: pkg.version,
          author_name: reg?.author_name ?? null,
          connections: connections.map((c) => ({
            name: c.name,
            type: c.type,
            label: c.label,
            has_token: c.has_token,
          })),
          installed,
        };
        jsonResponse(res, 200, response);
      } catch {
        jsonResponse(res, 500, { error: "Internal error" });
      }
      return;
    }

    // POST /action — start install/update/remove
    if (req.method === "POST" && req.url === "/action") {
      if (!isAllowedMutation(req)) {
        jsonResponse(res, 403, { error: "Forbidden" });
        return;
      }
      try {
        const raw = await readBody(req);
        let payload: { action?: string; package?: string; version?: string; target?: string; content?: string; filename?: string };
        try {
          payload = JSON.parse(raw) as typeof payload;
        } catch {
          jsonResponse(res, 400, { error: "Invalid JSON" });
          return;
        }

        if (!payload.action || !VALID_ACTIONS.has(payload.action)) {
          jsonResponse(res, 400, { error: "Invalid action. Must be install, update, remove, or publish." });
          return;
        }

        if (payload.action === "publish") {
          if (!payload.content) {
            jsonResponse(res, 400, { error: "Missing content for publish action." });
            return;
          }
        } else if (payload.action === "sync-connect" || payload.action === "sync-project") {
          if (!payload.content) {
            jsonResponse(res, 400, { error: "Missing content for sync action." });
            return;
          }
        } else {
          if (!payload.package || !PACKAGE_NAME_RE.test(payload.package)) {
            jsonResponse(res, 400, { error: "Invalid package name. Must match @author/name." });
            return;
          }
        }

        pruneExpiredTasks();

        if (activeTasks() >= MAX_CONCURRENT_TASKS) {
          jsonResponse(res, 429, { error: "Too many concurrent tasks" });
          return;
        }

        const id = `task_${crypto.randomBytes(8).toString("hex")}`;
        const task: ActionTask = {
          id,
          action: payload.action,
          package: payload.package ?? "",
          target: payload.target ?? "local",
          content: payload.content,
          filename: payload.filename,
          status: "pending",
          step: null,
          step_label: null,
          error: null,
          created_at: Date.now(),
        };

        taskStore.set(id, task);

        // Fire and forget — don't await
        executeTask(task);

        jsonResponse(res, 202, { id, status: "pending" });
      } catch {
        jsonResponse(res, 500, { error: "Internal error" });
      }
      return;
    }

    // GET /action/:id — poll task status
    if (req.method === "GET" && req.url?.startsWith("/action/")) {
      const id = req.url.slice("/action/".length);
      const task = taskStore.get(id);

      if (!task) {
        jsonResponse(res, 404, { error: "Task not found" });
        return;
      }

      jsonResponse(res, 200, {
        id: task.id,
        action: task.action,
        package: task.package,
        target: task.target,
        status: task.status,
        step: task.step,
        step_label: task.step_label,
        error: task.error,
      });
      return;
    }

    // Shutdown server
    if (req.method === "POST" && req.url === "/shutdown") {
      if (!isAllowedMutation(req)) {
        jsonResponse(res, 403, { error: "Forbidden" });
        return;
      }
      jsonResponse(res, 200, { ok: true });
      // Graceful shutdown after response is sent
      setImmediate(async () => {
        try { await fs.unlink(getStatusPortPath()); } catch { /* ignore */ }
        try { await fs.unlink(getStatusPidPath()); } catch { /* ignore */ }
        process.exit(0);
      });
      return;
    }

    // Generate a nonce for spm:// protocol challenge-response
    if (req.method === "GET" && req.url === "/protocol/nonce") {
      pruneExpiredNonces();
      if (nonceStore.size >= NONCE_MAX) {
        jsonResponse(res, 429, { error: "Too many pending nonces" });
        return;
      }
      const nonce = crypto.randomBytes(32).toString("hex");
      nonceStore.set(nonce, Date.now());
      jsonResponse(res, 200, { nonce });
      return;
    }

    // Verify a nonce (used by protocol-handle command)
    if (req.method === "POST" && req.url === "/protocol/verify-nonce") {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        try {
          const { nonce } = JSON.parse(body) as { nonce: string };
          if (!nonce || typeof nonce !== "string") {
            jsonResponse(res, 400, { error: "Missing nonce" });
            return;
          }
          const created = nonceStore.get(nonce);
          if (created == null) {
            jsonResponse(res, 200, { valid: false });
            return;
          }
          nonceStore.delete(nonce); // One-time use
          const expired = Date.now() - created > NONCE_TTL_MS;
          jsonResponse(res, 200, { valid: !expired });
        } catch {
          jsonResponse(res, 400, { error: "Invalid JSON" });
        }
      });
      return;
    }

    jsonResponse(res, 404, { error: "Not found" });
  });
}

export async function startServer(
  options?: StatusServerOptions,
): Promise<{ port: number; server: http.Server }> {
  const port = options?.port ?? DEFAULT_PORT;
  const host = options?.host ?? DEFAULT_HOST;
  const server = createStatusServer();

  const actualPort = await new Promise<number>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        // Try random port
        server.listen(0, host, () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            resolve(addr.port);
          } else {
            reject(new Error("Failed to get server address"));
          }
        });
      } else {
        reject(err);
      }
    });

    server.listen(port, host, () => {
      const addr = server.address();
      resolve(addr && typeof addr === "object" ? addr.port : port);
    });
  });

  // Always write port file
  const spmDir = getGlobalSkillsDir();
  await fs.mkdir(spmDir, { recursive: true });
  await fs.writeFile(getStatusPortPath(), String(actualPort), "utf-8");

  return { port: actualPort, server };
}

export async function stopServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  // Cleanup files
  try { await fs.unlink(getStatusPortPath()); } catch { /* ignore */ }
  try { await fs.unlink(getStatusPidPath()); } catch { /* ignore */ }
}

export async function readStatusPort(): Promise<number> {
  try {
    const content = await fs.readFile(getStatusPortPath(), "utf-8");
    const port = parseInt(content.trim(), 10);
    return Number.isFinite(port) ? port : DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

export async function ensureStatusServer(): Promise<void> {
  const port = await readStatusPort();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok) return; // Already running
  } catch {
    // Not running, start it
  }

  // Spawn daemon — resolve spm binary from this module's location
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const thisFile = fileURLToPath(import.meta.url);
  // thisFile = .../dist/core/status-server.js → cli entry = .../dist/cli/index.js
  const cliEntry = path.join(path.dirname(thisFile), "..", "cli", "index.js");
  const binPath = (await fs.access(cliEntry).then(() => cliEntry, () => null)) ?? process.argv[1] ?? "spm";
  const child = spawn(process.execPath, [binPath, "status-server", "__daemon"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
