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
