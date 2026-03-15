import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { parse, modify, applyEdits, type ModificationOptions } from "jsonc-parser";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";
import { getClient, getAllClients, getAllClientKeys } from "../../clients/index.js";

export const commands: CommandDef[] = [
  {
    name: "connect",
    description: "Connect skills to an AI client",
    group: "system",
    args: [{ name: "client", required: true }],
    handler: connectCommand,
  },
  {
    name: "disconnect",
    description: "Disconnect skills from an AI client",
    group: "system",
    args: [{ name: "client", required: true }],
    handler: disconnectCommand,
  },
];

const JSONC_MODIFY_OPTIONS: ModificationOptions = {
  formattingOptions: { tabSize: 2, insertSpaces: true },
};

function getSkillsBin(): string {
  const arg1 = process.argv[1];
  if (arg1) {
    try {
      return realpathSync(arg1);
    } catch {
      return arg1;
    }
  }
  return "spm";
}

async function readRawConfig(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "{}";
  }
}

async function writeRawConfig(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const normalized = content.endsWith("\n") ? content : content + "\n";
  await fs.writeFile(filePath, normalized, "utf-8");
}

function getNestedValue(data: Record<string, unknown>, jsonPath: string[]): unknown {
  let current: unknown = data;
  for (const segment of jsonPath) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function supportedClientsList(): string {
  const clients = getAllClients();
  return clients.map((c) => {
    const aliases = c.aliases?.length ? ` (${c.aliases.join(", ")})` : "";
    return `${c.id}${aliases}`;
  }).join(", ");
}

export async function connectCommand(
  client: string,
): Promise<void> {
  const def = getClient(client);

  if (!def) {
    exitError(`Unknown client "${client}". Supported: ${supportedClientsList()}`);
  }

  let content = await readRawConfig(def.configPath);
  const data = parse(content) as Record<string, unknown>;

  if (getNestedValue(data, def.jsonPath)) {
    log.info(`Already connected to ${def.name}.`);
    log.message(`Config: ${def.configPath}`);
    return;
  }

  const svArgs = { execPath: process.execPath, binPath: getSkillsBin() };
  const serverValue = def.buildServerValue
    ? def.buildServerValue(svArgs)
    : { command: svArgs.execPath, args: [svArgs.binPath, "serve"], ...def.extraFields };

  const edits = modify(content, def.jsonPath, serverValue, JSONC_MODIFY_OPTIONS);
  content = applyEdits(content, edits);

  await writeRawConfig(def.configPath, content);

  log.success(`Connected to ${def.name}.`);
  log.message(`Config: ${def.configPath}`);
  log.info(`Restart ${def.name} to activate.`);
}

export async function disconnectCommand(
  client: string,
): Promise<void> {
  const def = getClient(client);

  if (!def) {
    exitError(`Unknown client "${client}". Supported: ${supportedClientsList()}`);
  }

  let content = await readRawConfig(def.configPath);
  const data = parse(content) as Record<string, unknown>;

  if (!getNestedValue(data, def.jsonPath)) {
    log.info(`Not connected to ${def.name}.`);
    return;
  }

  const edits = modify(content, def.jsonPath, undefined, JSONC_MODIFY_OPTIONS);
  content = applyEdits(content, edits);

  await writeRawConfig(def.configPath, content);

  log.success(`Disconnected from ${def.name}.`);
  log.message(`Config: ${def.configPath}`);
  log.info(`Restart ${def.name} to apply.`);
}
