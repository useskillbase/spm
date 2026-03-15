import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

function settingsPath(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", "Code", "User", "settings.json");
    case "win32":
      return path.join(process.env.APPDATA || home, "Code", "User", "settings.json");
    default:
      return path.join(home, ".config", "Code", "User", "settings.json");
  }
}

export function define(): ClientDefinition {
  return {
    id: "vscode",
    name: "VS Code",
    aliases: ["code"],
    configPath: settingsPath(),
    jsonPath: ["mcp", "servers", "spm"],
    extraFields: { type: "stdio" },
  };
}
