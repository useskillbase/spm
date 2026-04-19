import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import { parse, modify, applyEdits, type ModificationOptions } from "jsonc-parser";
import { log, exitError, password, isCancel } from "../ui.js";
import type { CommandDef } from "../command.js";
import { getClient, getAllClients } from "../../clients/index.js";
import {
  addConnection,
  removeConnection,
  listConnections,
  setDefault,
  testConnection,
} from "../../core/connections.js";

export const commands: CommandDef[] = [
  {
    name: "connect",
    description: "Connect skills to an AI client",
    group: "system",
    args: [{ name: "client", required: true }],
    options: [
      { flags: "--remote <url>", description: "Remote OpenClaw server URL" },
      { flags: "--name <name>", description: "Connection name (for remote)" },
      { flags: "--label <label>", description: "Display label (for remote)" },
      { flags: "--token <token>", description: "Auth token (for remote, interactive if omitted)" },
    ],
    handler: connectCommand,
  },
  {
    name: "disconnect",
    description: "Disconnect skills from an AI client",
    group: "system",
    args: [{ name: "client", required: true }],
    handler: disconnectCommand,
  },
  {
    name: "connections",
    description: "Manage remote connections",
    group: "system",
    subcommands: [
      {
        name: "list",
        description: "List all remote connections",
        group: "system",
        handler: connectionsListCommand,
      },
      {
        name: "test",
        description: "Test a remote connection",
        group: "system",
        args: [{ name: "name", required: true }],
        handler: connectionsTestCommand,
      },
      {
        name: "default",
        description: "Set default connection",
        group: "system",
        args: [{ name: "name", required: true }],
        handler: connectionsDefaultCommand,
      },
      {
        name: "remove",
        description: "Remove a remote connection",
        group: "system",
        args: [{ name: "name", required: true }],
        handler: connectionsRemoveCommand,
      },
    ],
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
  options: { remote?: string; name?: string; label?: string; token?: string },
): Promise<void> {
  // Remote OpenClaw connection
  if (options.remote) {
    if (client !== "openclaw") {
      exitError("--remote flag is only supported for openclaw connections");
    }
    await connectRemoteOpenClaw(options.remote, options.name, options.label, options.token);
    return;
  }

  const def = getClient(client);

  if (!def) {
    exitError(`Unknown client "${client}". Supported: ${supportedClientsList()}`);
  }

  const svArgs = { execPath: process.execPath, binPath: getSkillsBin() };

  if (def.connector) {
    const { alreadyConnected } = await def.connector.connect(svArgs);
    if (alreadyConnected) {
      log.info(`Already connected to ${def.name}.`);
    } else {
      log.success(`Connected to ${def.name}.`);
    }
    log.message(`Config: ${def.configPath}`);
    if (!alreadyConnected) {
      log.info(`Restart ${def.name} to activate.`);
    }
  } else {
    let content = await readRawConfig(def.configPath);
    const data = parse(content) as Record<string, unknown>;

    if (getNestedValue(data, def.jsonPath)) {
      log.info(`Already connected to ${def.name}.`);
      log.message(`Config: ${def.configPath}`);
      return;
    }

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

  // Auto-start status server for website integration
  try {
    const { ensureStatusServer } = await import("../../core/status-server.js");
    await ensureStatusServer();
  } catch { /* non-fatal */ }
}

async function connectRemoteOpenClaw(
  url: string,
  name?: string,
  label?: string,
  token?: string,
): Promise<void> {
  const connName = name ?? new URL(url).hostname.split(".")[0];
  const connLabel = label ?? connName;

  let connToken = token;
  if (!connToken) {
    const input = await password({
      message: "Enter authentication token:",
    });
    if (isCancel(input) || !input) {
      exitError("Token is required for remote connection");
    }
    connToken = input as string;
  }

  const { secure } = await addConnection(connName, {
    type: "openclaw",
    url,
    token: connToken,
    label: connLabel,
  });

  if (!secure) {
    log.warning("Token stored in plaintext (OS keychain not available)");
  }

  log.success(`Connection "${connName}" added.`);

  // Test the connection
  log.info("Testing connection...");
  const result = await testConnection(connName);
  if (result.ok) {
    log.success("Connection verified.");
  } else {
    log.warning(`Connection test failed: ${result.error}`);
    log.info("The connection was saved. You can test again with: spm connections test " + connName);
  }
}

export async function disconnectCommand(
  client: string,
): Promise<void> {
  const def = getClient(client);

  if (!def) {
    exitError(`Unknown client "${client}". Supported: ${supportedClientsList()}`);
  }

  if (def.connector) {
    const { wasConnected } = await def.connector.disconnect();
    if (!wasConnected) {
      log.info(`Not connected to ${def.name}.`);
      return;
    }
    log.success(`Disconnected from ${def.name}.`);
    log.message(`Config: ${def.configPath}`);
    log.info(`Restart ${def.name} to apply.`);
    return;
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

// -- Connections subcommands --

async function connectionsListCommand(): Promise<void> {
  const connections = await listConnections();

  if (connections.length === 0) {
    log.info("No remote connections configured.");
    log.message("Add one with: spm connect openclaw --remote <url>");
    return;
  }

  for (const conn of connections) {
    const defaultMark = conn.isDefault ? " (default)" : "";
    const verified = conn.verified_at
      ? ` — verified ${new Date(conn.verified_at).toLocaleDateString()}`
      : "";
    log.info(`${conn.name}${defaultMark} — ${conn.type} — ${conn.label}${verified}`);
  }
}

async function connectionsTestCommand(name: string): Promise<void> {
  log.info(`Testing connection "${name}"...`);
  const result = await testConnection(name);
  if (result.ok) {
    log.success("Connection OK.");
  } else {
    exitError(`Connection failed: ${result.error}`);
  }
}

async function connectionsDefaultCommand(name: string): Promise<void> {
  try {
    await setDefault(name);
    log.success(`Default connection set to "${name}".`);
  } catch (err) {
    exitError(err instanceof Error ? err.message : String(err));
  }
}

async function connectionsRemoveCommand(name: string): Promise<void> {
  const removed = await removeConnection(name);
  if (removed) {
    log.success(`Connection "${name}" removed.`);
  } else {
    exitError(`Connection "${name}" not found.`);
  }
}
