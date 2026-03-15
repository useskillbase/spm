import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "cursor",
    name: "Cursor",
    configPath: path.join(os.homedir(), ".cursor", "mcp.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
