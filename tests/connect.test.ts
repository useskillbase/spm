import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skillbase-connect-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Test the core logic directly since the command depends on platform paths
// We replicate the read/write/merge logic here

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

describe("connect/disconnect config merge", () => {
  it("creates config file when it does not exist", async () => {
    const configPath = path.join(tmpDir, "claude", "config.json");
    const data = await readJsonFile(configPath);
    const section = (data["mcpServers"] ?? {}) as Record<string, unknown>;

    section["skills"] = { command: "node", args: ["serve"] };
    data["mcpServers"] = section;

    await writeJsonFile(configPath, data);

    const result = JSON.parse(await fs.readFile(configPath, "utf-8"));
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

    const data = await readJsonFile(configPath);
    const section = (data["mcpServers"] ?? {}) as Record<string, unknown>;
    section["skills"] = { command: "node", args: ["serve"] };
    data["mcpServers"] = section;

    await writeJsonFile(configPath, data);

    const result = JSON.parse(await fs.readFile(configPath, "utf-8"));
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

    const data = await readJsonFile(configPath);
    const section = (data["mcpServers"] ?? {}) as Record<string, unknown>;
    delete section["skills"];
    data["mcpServers"] = section;

    await writeJsonFile(configPath, data);

    const result = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(result.mcpServers.skills).toBeUndefined();
    expect(result.mcpServers["other-server"]).toEqual({ command: "other", args: [] });
  });

  it("handles empty existing file gracefully", async () => {
    const configPath = path.join(tmpDir, "config.json");
    await fs.writeFile(configPath, "");

    const data = await readJsonFile(configPath);
    expect(data).toEqual({});

    const section = (data["mcpServers"] ?? {}) as Record<string, unknown>;
    section["skills"] = { command: "node", args: ["serve"] };
    data["mcpServers"] = section;

    await writeJsonFile(configPath, data);

    const result = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(result.mcpServers.skills).toEqual({ command: "node", args: ["serve"] });
  });

  it("zed context_servers section works the same way", async () => {
    const configPath = path.join(tmpDir, "settings.json");
    await fs.writeFile(configPath, JSON.stringify({
      theme: "dark",
      context_servers: {},
    }, null, 2));

    const data = await readJsonFile(configPath);
    const section = (data["context_servers"] ?? {}) as Record<string, unknown>;
    section["skills"] = { command: "node", args: ["serve"] };
    data["context_servers"] = section;

    await writeJsonFile(configPath, data);

    const result = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(result.context_servers.skills).toEqual({ command: "node", args: ["serve"] });
    expect(result.theme).toBe("dark");
  });
});
