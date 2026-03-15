import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "opencode",
    name: "OpenCode",
    configPath: path.join(os.homedir(), ".config", "opencode", "opencode.json"),
    jsonPath: ["mcp", "spm"],
    buildServerValue: ({ execPath, binPath }) => ({
      type: "local",
      command: [execPath, binPath, "serve"],
    }),
  };
}
