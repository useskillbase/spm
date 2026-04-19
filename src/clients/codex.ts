import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

const CODEX_BIN = "codex";
const SERVER_NAME = "spm";

function ensureCodexInstalled(): void {
  const result = spawnSync(CODEX_BIN, ["--version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    throw new Error(
      "Codex CLI not found on PATH. Install it (e.g. `npm install -g @openai/codex`) and retry.",
    );
  }
}

function isServerRegistered(): boolean {
  const result = spawnSync(CODEX_BIN, ["mcp", "get", SERVER_NAME], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  return result.status === 0;
}

function runCodex(args: string[]): void {
  const result = spawnSync(CODEX_BIN, args, { encoding: "utf-8" });
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "unknown error").trim();
    throw new Error(`codex ${args.join(" ")} failed: ${msg}`);
  }
}

export function define(): ClientDefinition {
  return {
    id: "codex",
    name: "OpenAI Codex",
    configPath: path.join(os.homedir(), ".codex", "config.toml"),
    jsonPath: ["mcp_servers", SERVER_NAME],
    connector: {
      async connect({ execPath, binPath }) {
        ensureCodexInstalled();
        if (isServerRegistered()) {
          return { alreadyConnected: true };
        }
        runCodex(["mcp", "add", SERVER_NAME, "--", execPath, binPath, "serve"]);
        return { alreadyConnected: false };
      },
      async disconnect() {
        ensureCodexInstalled();
        if (!isServerRegistered()) {
          return { wasConnected: false };
        }
        runCodex(["mcp", "remove", SERVER_NAME]);
        return { wasConnected: true };
      },
    },
  };
}
