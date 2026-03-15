import path from "node:path";
import os from "node:os";
import type { ClientDefinition } from "./types.js";

export function define(): ClientDefinition {
  return {
    id: "zed",
    name: "Zed",
    configPath: path.join(os.homedir(), ".config", "zed", "settings.json"),
    jsonPath: ["context_servers", "spm"],
  };
}
