import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "jetbrains",
    name: "JetBrains",
    aliases: ["jb"],
    configPath: path.join(os.homedir(), ".junie", "mcp", "mcp.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
