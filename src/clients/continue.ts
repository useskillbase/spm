import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "continue",
    name: "Continue",
    configPath: path.join(os.homedir(), ".continue", "mcp.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
