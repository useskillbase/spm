import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "amazonq",
    name: "Amazon Q",
    configPath: path.join(os.homedir(), ".aws", "amazonq", "mcp.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
