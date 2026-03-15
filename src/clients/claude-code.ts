import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "claude-code",
    name: "Claude Code",
    configPath: path.join(os.homedir(), ".claude.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
