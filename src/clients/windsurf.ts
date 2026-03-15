import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "windsurf",
    name: "Windsurf",
    configPath: path.join(os.homedir(), ".codeium", "windsurf", "mcp_config.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
