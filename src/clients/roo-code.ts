import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

function globalStoragePath(): string {
  const home = os.homedir();
  const base =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support", "Code", "User")
      : process.platform === "win32"
        ? path.join(process.env.APPDATA || home, "Code", "User")
        : path.join(home, ".config", "Code", "User");

  return path.join(base, "globalStorage", "rooveterinaryinc.roo-cline", "settings", "mcp_settings.json");
}

export function define(): ClientDefinition {
  return {
    id: "roo-code",
    name: "Roo Code",
    aliases: ["roo"],
    configPath: globalStoragePath(),
    jsonPath: ["mcpServers", "spm"],
    extraFields: { disabled: false, alwaysAllow: [] },
  };
}
