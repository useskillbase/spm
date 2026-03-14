import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const MCP_SERVER_KEY = "spm";

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

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJsonFile(filePath: string, data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
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

  const data = await readJsonFile(config.configPath);
  const section = (data[config.serverSection] ?? {}) as Record<string, unknown>;

  if (section[MCP_SERVER_KEY]) {
    console.log(`Already connected to ${config.name}.`);
    console.log(`  Config: ${config.configPath}`);
    return;
  }

  section[MCP_SERVER_KEY] = {
    command: process.execPath,
    args: [getSkillsBin(), "serve"],
  };
  data[config.serverSection] = section;

  await writeJsonFile(config.configPath, data);

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

  const data = await readJsonFile(config.configPath);
  const section = (data[config.serverSection] ?? {}) as Record<string, unknown>;

  if (!section[MCP_SERVER_KEY]) {
    console.log(`Not connected to ${config.name}.`);
    return;
  }

  delete section[MCP_SERVER_KEY];
  data[config.serverSection] = section;

  await writeJsonFile(config.configPath, data);

  console.log(`Disconnected from ${config.name}.`);
  console.log(`  Config: ${config.configPath}`);
  console.log(`  Restart ${config.name} to apply.`);
}
