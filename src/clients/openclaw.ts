import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "openclaw",
    name: "OpenClaw",
    aliases: ["oc"],
    configPath: path.join(
      os.homedir(),
      ".openclaw",
      "workspace",
      "config",
      "mcporter.json",
    ),
    jsonPath: ["mcpServers", "spm"],
  };
}
