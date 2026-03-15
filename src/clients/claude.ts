import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  const home = os.homedir();
  const configDir =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support", "Claude")
      : path.join(home, ".config", "Claude");

  return {
    id: "claude",
    name: "Claude Desktop",
    configPath: path.join(configDir, "claude_desktop_config.json"),
    jsonPath: ["mcpServers", "spm"],
  };
}
