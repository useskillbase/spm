import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "gemini",
    name: "Gemini CLI",
    configPath: path.join(os.homedir(), ".gemini", "settings.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
