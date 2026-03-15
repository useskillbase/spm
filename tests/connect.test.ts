import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parse, modify, applyEdits, type ModificationOptions } from "jsonc-parser";

let tmpDir: string;

const MODIFY_OPTIONS: ModificationOptions = {
  formattingOptions: { tabSize: 2, insertSpaces: true },
};

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skillbase-connect-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Replicate the core read/modify/write logic from connect.ts

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

function addServer(content: string, serverSection: string, key: string, value: unknown): string {
  const edits = modify(content, [serverSection, key], value, MODIFY_OPTIONS);
  return applyEdits(content, edits);
}

function removeServer(content: string, serverSection: string, key: string): string {
  const edits = modify(content, [serverSection, key], undefined, MODIFY_OPTIONS);
  return applyEdits(content, edits);
}

describe("connect/disconnect config merge", () => {
  it("creates config file when it does not exist", async () => {
    const configPath = path.join(tmpDir, "claude", "config.json");
    let content = await readRawConfig(configPath);

    content = addServer(content, "mcpServers", "skills", { command: "node", args: ["serve"] });
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcpServers.skills).toEqual({ command: "node", args: ["serve"] });
  });

  it("preserves existing config when adding skills", async () => {
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify({
      mcpServers: {
        "other-server": { command: "other", args: [] },
      },
      someOtherSetting: true,
    }, null, 2));

    let content = await readRawConfig(configPath);
    content = addServer(content, "mcpServers", "skills", { command: "node", args: ["serve"] });
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcpServers.skills).toEqual({ command: "node", args: ["serve"] });
    expect(result.mcpServers["other-server"]).toEqual({ command: "other", args: [] });
    expect(result.someOtherSetting).toBe(true);
  });

  it("removes only skills key on disconnect", async () => {
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, JSON.stringify({
      mcpServers: {
        skills: { command: "node", args: ["serve"] },
        "other-server": { command: "other", args: [] },
      },
    }, null, 2));

    let content = await readRawConfig(configPath);
    content = removeServer(content, "mcpServers", "skills");
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcpServers.skills).toBeUndefined();
    expect(result.mcpServers["other-server"]).toEqual({ command: "other", args: [] });
  });

  it("handles empty existing file gracefully", async () => {
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, "");

    let content = await readRawConfig(configPath);
    // Empty string → treat as "{}"
    if (content.trim() === "") content = "{}";
    content = addServer(content, "mcpServers", "skills", { command: "node", args: ["serve"] });
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcpServers.skills).toEqual({ command: "node", args: ["serve"] });
  });

  it("zed context_servers section works the same way", async () => {
    const configPath = path.join(tmpDir, "settings.json");
    await fs.writeFile(configPath, JSON.stringify({
      theme: "dark",
      context_servers: {},
    }, null, 2));

    let content = await readRawConfig(configPath);
    content = addServer(content, "context_servers", "skills", { command: "node", args: ["serve"] });
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.context_servers.skills).toEqual({ command: "node", args: ["serve"] });
    expect(result.theme).toBe("dark");
  });

  it("preserves JSONC comments in zed settings", async () => {
    const configPath = path.join(tmpDir, "settings.json");
    const jsonc = `{
  // Zed theme
  "theme": "One Dark",
  // Trailing comma is fine in JSONC
  "vim_mode": true,
}`;
    await fs.writeFile(configPath, jsonc);

    let content = await readRawConfig(configPath);
    content = addServer(content, "context_servers", "spm", { command: "node", args: ["serve"] });
    await writeRawConfig(configPath, content);

    const written = await fs.readFile(configPath, "utf-8");
    // Comments must survive
    expect(written).toContain("// Zed theme");
    expect(written).toContain("// Trailing comma");
    // Original settings preserved
    const result = parse(written) as Record<string, any>;
    expect(result.theme).toBe("One Dark");
    expect(result.vim_mode).toBe(true);
    expect(result.context_servers.spm).toEqual({ command: "node", args: ["serve"] });
  });
});

// Helper for arbitrary-depth JSON path operations (mirrors connect.ts refactor)
function addServerAtPath(content: string, jsonPath: string[], value: unknown): string {
  const edits = modify(content, jsonPath, value, MODIFY_OPTIONS);
  return applyEdits(content, edits);
}

function removeServerAtPath(content: string, jsonPath: string[]): string {
  const edits = modify(content, jsonPath, undefined, MODIFY_OPTIONS);
  return applyEdits(content, edits);
}

describe("multi-segment JSON path support", () => {
  it("supports 3-segment path for vscode format", async () => {
    const configPath = path.join(tmpDir, "settings.json");
    let content = "{}";

    content = addServerAtPath(content, ["mcp", "servers", "spm"], {
      type: "stdio",
      command: "node",
      args: ["serve"],
    });
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcp.servers.spm).toEqual({ type: "stdio", command: "node", args: ["serve"] });
  });

  it("preserves existing settings with 3-segment path", async () => {
    const configPath = path.join(tmpDir, "settings.json");
    await fs.writeFile(configPath, JSON.stringify({
      "editor.fontSize": 14,
      mcp: { servers: {} },
    }, null, 2));

    let content = await readRawConfig(configPath);
    content = addServerAtPath(content, ["mcp", "servers", "spm"], {
      type: "stdio",
      command: "node",
      args: ["serve"],
    });
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcp.servers.spm).toEqual({ type: "stdio", command: "node", args: ["serve"] });
    expect(result["editor.fontSize"]).toBe(14);
  });

  it("removes server at 3-segment path without destroying siblings", async () => {
    const configPath = path.join(tmpDir, "settings.json");
    await fs.writeFile(configPath, JSON.stringify({
      mcp: {
        servers: {
          spm: { type: "stdio", command: "node", args: ["serve"] },
          other: { type: "stdio", command: "other", args: [] },
        },
      },
    }, null, 2));

    let content = await readRawConfig(configPath);
    content = removeServerAtPath(content, ["mcp", "servers", "spm"]);
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcp.servers.spm).toBeUndefined();
    expect(result.mcp.servers.other).toEqual({ type: "stdio", command: "other", args: [] });
  });
});

describe("extra fields in server value", () => {
  it("includes extra fields for cline/roo format", async () => {
    const configPath = path.join(tmpDir, "cline_mcp_settings.json");
    let content = "{}";

    const serverValue = {
      command: "node",
      args: ["serve"],
      disabled: false,
      alwaysAllow: [],
    };
    content = addServer(content, "mcpServers", "spm", serverValue);
    await writeRawConfig(configPath, content);

    const result = parse(await fs.readFile(configPath, "utf-8")) as Record<string, any>;
    expect(result.mcpServers.spm).toEqual(serverValue);
    expect(result.mcpServers.spm.disabled).toBe(false);
    expect(result.mcpServers.spm.alwaysAllow).toEqual([]);
  });
});

describe("client registry", () => {
  it("resolves all client IDs", async () => {
    const { getClient, getAllClients, getAllClientKeys } = await import("../src/clients/index.js");

    const clients = getAllClients();
    expect(clients.length).toBe(13);

    for (const client of clients) {
      expect(getClient(client.id)).toBe(client);
    }

    // Check aliases resolve
    expect(getClient("jb")?.id).toBe("jetbrains");
    expect(getClient("code")?.id).toBe("vscode");
    expect(getClient("roo")?.id).toBe("roo-code");

    // Unknown client returns undefined
    expect(getClient("unknown")).toBeUndefined();

    // All keys include aliases
    const keys = getAllClientKeys();
    expect(keys).toContain("jetbrains");
    expect(keys).toContain("jb");
    expect(keys).toContain("vscode");
    expect(keys).toContain("code");
  });
});
