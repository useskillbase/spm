import type { ClientDefinition } from "./types.js";

import * as claude from "./claude.js";
import * as claudeCode from "./claude-code.js";
import * as zed from "./zed.js";
import * as cursor from "./cursor.js";
import * as vscode from "./vscode.js";
import * as windsurf from "./windsurf.js";
import * as jetbrains from "./jetbrains.js";
import * as cline from "./cline.js";
import * as rooCode from "./roo-code.js";
import * as continueExt from "./continue.js";
import * as amazonq from "./amazonq.js";
import * as gemini from "./gemini.js";
import * as opencode from "./opencode.js";

const modules = [
  claude, claudeCode, zed, cursor, vscode, windsurf,
  jetbrains, cline, rooCode, continueExt, amazonq, gemini, opencode,
];

const definitions: ClientDefinition[] = modules.map((m) => m.define());

// Map id + aliases → definition
const registry = new Map<string, ClientDefinition>();
for (const def of definitions) {
  registry.set(def.id, def);
  for (const alias of def.aliases ?? []) {
    registry.set(alias, def);
  }
}

export function getClient(key: string): ClientDefinition | undefined {
  return registry.get(key);
}

export function getAllClients(): ClientDefinition[] {
  return definitions;
}

export function getAllClientKeys(): string[] {
  return Array.from(registry.keys());
}

export type { ClientDefinition } from "./types.js";
