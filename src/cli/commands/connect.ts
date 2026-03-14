import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse, modify, applyEdits, type ModificationOptions } from "jsonc-parser";

const MCP_SERVER_KEY = "spm";

const JSONC_MODIFY_OPTIONS: ModificationOptions = {
  formattingOptions: { tabSize: 2, insertSpaces: true },
};

interface ClientConfig {
  name: string;
  configPath: string;
  serverSection: string; // JSON key that holds MCP servers
}

function getClients(): Record<string, ClientConfig> {
  const home = os.homedir();
  const platform = process.platform;

  const claudeConfigDir =
    platform === "darwin"
      ? path.join(home, "Library", "Application Support", "Claude")
      : path.join(home, ".config", "Claude");

  return {
    claude: {
      name: "Claude Desktop",
      configPath: path.join(claudeConfigDir, "claude_desktop_config.json"),
      serverSection: "mcpServers",
    },
    zed: {
      name: "Zed",
      configPath: path.join(home, ".config", "zed", "settings.json"),
      serverSection: "context_servers",
    },
  };
}

function getSkillsBin(): string {
  // Resolve the real path (follows symlinks) to the dist/cli/index.js entry
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

export async function connectCommand(
  client: string,
): Promise<void> {
  const clients = getClients();
  const config = clients[client];

  if (!config) {
    console.error(`Unknown client "${client}". Supported: ${Object.keys(clients).join(", ")}`);
    process.exit(1);
  }

  let content = await readRawConfig(config.configPath);
  const data = parse(content) as Record<string, Record<string, unknown>>;
  const section = data[config.serverSection] ?? {};

  if (section[MCP_SERVER_KEY]) {
    console.log(`Already connected to ${config.name}.`);
    console.log(`  Config: ${config.configPath}`);
    return;
  }

  const serverValue = {
    command: process.execPath,
    args: [getSkillsBin(), "serve"],
  };

  const edits = modify(
    content,
    [config.serverSection, MCP_SERVER_KEY],
    serverValue,
    JSONC_MODIFY_OPTIONS,
  );
  content = applyEdits(content, edits);

  await writeRawConfig(config.configPath, content);

  console.log(`Connected to ${config.name}.`);
  console.log(`  Config: ${config.configPath}`);
  console.log(`  Restart ${config.name} to activate.`);
}

export async function disconnectCommand(
  client: string,
): Promise<void> {
  const clients = getClients();
  const config = clients[client];

  if (!config) {
    console.error(`Unknown client "${client}". Supported: ${Object.keys(clients).join(", ")}`);
    process.exit(1);
  }

  let content = await readRawConfig(config.configPath);
  const data = parse(content) as Record<string, Record<string, unknown>>;
  const section = data[config.serverSection] ?? {};

  if (!section[MCP_SERVER_KEY]) {
    console.log(`Not connected to ${config.name}.`);
    return;
  }

  const edits = modify(
    content,
    [config.serverSection, MCP_SERVER_KEY],
    undefined, // undefined = remove the key
    JSONC_MODIFY_OPTIONS,
  );
  content = applyEdits(content, edits);

  await writeRawConfig(config.configPath, content);

  console.log(`Disconnected from ${config.name}.`);
  console.log(`  Config: ${config.configPath}`);
  console.log(`  Restart ${config.name} to apply.`);
}
