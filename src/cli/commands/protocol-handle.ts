import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";
import { showConfirmDialog } from "../../core/protocol/dialog.js";
import { registerProtocol, unregisterProtocol, isSupported } from "../../core/protocol/register.js";
import { readStatusPort } from "../../core/status-server.js";

export const VALID_PACKAGE = /^@[a-z0-9-]+\/[a-z0-9-]+$/;
export const VALID_ACTIONS = new Set(["install", "activate", "connect", "start"]);
const RATE_LIMIT_FILE = path.join(os.homedir(), ".spm", "protocol-rate.json");
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;
const TIMEOUT_MS = 60_000;

export const commands: CommandDef[] = [
  {
    name: "protocol-handle",
    description: "Handle spm:// protocol URLs",
    group: "system",
    args: [{ name: "url", required: true, description: "spm:// URL to handle" }],
    handler: protocolHandleCommand,
  },
  {
    name: "protocol",
    description: "Manage spm:// protocol handler",
    group: "system",
    subcommands: [
      {
        name: "register",
        description: "Register spm:// protocol handler with the OS",
        group: "system",
        handler: protocolRegisterCommand,
      },
      {
        name: "unregister",
        description: "Remove spm:// protocol handler",
        group: "system",
        handler: protocolUnregisterCommand,
      },
    ],
  },
];

// -- URL Parsing --

export interface ProtocolRequest {
  action: string;
  target: string; // "@author/name" for install/activate, client name for connect
  params: Record<string, string>;
}

export function parseProtocolUrl(raw: string): ProtocolRequest {
  // Normalize: spm://install/@core/docx?version=1.0
  // URL constructor treats spm: as scheme, // as authority separator
  // We need to handle the path manually
  const cleaned = raw.replace(/^spm:\/\//, "");
  const [pathPart, queryPart] = cleaned.split("?", 2);
  const segments = pathPart.split("/").filter(Boolean);

  if (segments.length < 1) {
    throw new Error(`Invalid spm:// URL: expected at least an action`);
  }

  const action = segments[0];

  // spm://start has no target
  if (action === "start") {
    const params: Record<string, string> = {};
    if (queryPart) {
      for (const pair of queryPart.split("&")) {
        const [key, val] = pair.split("=", 2);
        if (key) params[key] = decodeURIComponent(val ?? "");
      }
    }
    return { action, target: "", params };
  }

  if (segments.length < 2) {
    throw new Error(`Invalid spm:// URL: expected action and target`);
  }

  // For install/activate: remaining segments form "@author/name"
  // e.g. ["install", "@core", "docx"] → action="install", target="@core/docx"
  // For connect: ["connect", "claude"] → action="connect", target="claude"
  let target: string;
  if (action === "connect") {
    target = segments.slice(1).join("/");
  } else {
    // Join remaining with "/" and ensure @ prefix
    target = segments.slice(1).join("/");
    if (!target.startsWith("@")) {
      target = "@" + target;
    }
  }

  const params: Record<string, string> = {};
  if (queryPart) {
    for (const pair of queryPart.split("&")) {
      const [key, val] = pair.split("=", 2);
      if (key) {
        params[key] = decodeURIComponent(val ?? "");
      }
    }
  }

  return { action, target, params };
}

// -- Rate Limiting --

interface RateState {
  timestamps: number[];
}

async function checkRateLimit(): Promise<boolean> {
  const now = Date.now();
  let state: RateState = { timestamps: [] };

  try {
    const raw = await fs.readFile(RATE_LIMIT_FILE, "utf-8");
    state = JSON.parse(raw) as RateState;
  } catch {
    // No file — first request
  }

  // Remove entries outside the window
  state.timestamps = state.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (state.timestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }

  state.timestamps.push(now);
  await fs.mkdir(path.dirname(RATE_LIMIT_FILE), { recursive: true });
  await fs.writeFile(RATE_LIMIT_FILE, JSON.stringify(state), "utf-8");
  return true;
}

// -- Nonce Verification --

async function verifyNonce(nonce: string): Promise<boolean> {
  const port = await readStatusPort();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/protocol/verify-nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { valid: boolean };
    return data.valid === true;
  } catch {
    return false;
  }
}

// -- Action Dispatch --

async function dispatchAction(request: ProtocolRequest): Promise<void> {
  const { action, target, params } = request;

  switch (action) {
    case "install": {
      // Dynamic import to avoid loading heavy modules unless needed
      const { addCommand } = await import("./add.js");
      await addCommand(target.replace(/^@/, ""), {
        global: false,
        version: params.version,
      });
      break;
    }
    case "activate": {
      const { personaActivateCommand } = await import("./persona.js");
      await personaActivateCommand(target.replace(/^@/, ""));
      break;
    }
    case "connect": {
      const { connectCommand } = await import("./connect.js");
      await connectCommand(target, {});
      break;
    }
    case "start": {
      const { ensureStatusServer, readStatusPort } = await import("../../core/status-server.js");
      await ensureStatusServer();
      // Wait for daemon to be reachable before exiting
      const port = await readStatusPort();
      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(500) });
          if (res.ok) break;
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 300));
      }
      break;
    }
    default:
      exitError(`Unknown action: ${action}`);
  }
}

// -- Main Handler --

async function protocolHandleCommand(url: string): Promise<void> {
  // Parse URL
  let request: ProtocolRequest;
  try {
    request = parseProtocolUrl(url);
  } catch (err) {
    exitError(err instanceof Error ? err.message : `Invalid URL: ${url}`);
  }

  // Validate action
  if (!VALID_ACTIONS.has(request.action)) {
    exitError(`Unknown action: "${request.action}". Valid: ${[...VALID_ACTIONS].join(", ")}`);
  }

  // Validate package name for install/activate
  if (request.action !== "connect" && request.action !== "start" && !VALID_PACKAGE.test(request.target)) {
    exitError(`Invalid package name: "${request.target}". Expected @author/name.`);
  }

  // Rate limit
  const allowed = await checkRateLimit();
  if (!allowed) {
    exitError("Rate limit exceeded. Max 3 protocol requests per minute.");
  }

  // Nonce verification (if provided)
  if (request.params.nonce) {
    const valid = await verifyNonce(request.params.nonce);
    if (!valid) {
      exitError("Nonce verification failed. The request may have been forged or expired.");
    }
  }

  // start is safe (read-only server on loopback) — skip OS dialog
  if (request.action !== "start") {
    const dialogMessage = buildDialogMessage(request);
    const result = await Promise.race([
      showConfirmDialog("spm — Protocol Request", dialogMessage),
      new Promise<{ confirmed: false }>((resolve) =>
        setTimeout(() => resolve({ confirmed: false }), TIMEOUT_MS),
      ),
    ]);

    if (!result.confirmed) {
      log.info("Request denied by user.");
      return;
    }
  }

  // Dispatch
  await dispatchAction(request);
}

export function buildDialogMessage(request: ProtocolRequest): string {
  switch (request.action) {
    case "install":
      return `Install skill ${request.target}${request.params.version ? ` v${request.params.version}` : ""}?`;
    case "activate":
      return `Activate persona ${request.target}?`;
    case "connect":
      return `Connect to ${request.target}?`;
    case "start":
      return "Start spm status server?";
    default:
      return `${request.action}: ${request.target}?`;
  }
}

// -- Protocol registration commands --

async function protocolRegisterCommand(): Promise<void> {
  if (!isSupported()) {
    exitError(`Protocol registration is not supported on ${process.platform}.`);
  }

  try {
    await registerProtocol();
    log.success("Protocol handler registered for spm:// URLs.");
  } catch (err) {
    exitError(`Failed to register protocol handler: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function protocolUnregisterCommand(): Promise<void> {
  try {
    await unregisterProtocol();
    log.success("Protocol handler removed.");
  } catch (err) {
    exitError(`Failed to unregister protocol handler: ${err instanceof Error ? err.message : String(err)}`);
  }
}
