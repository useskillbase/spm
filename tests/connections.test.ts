import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";

// Mock keychain before importing connections
vi.mock("../src/core/keychain.js", () => ({
  KEYCHAIN_SENTINEL: "__keychain__",
  getToken: vi.fn().mockResolvedValue(null),
  setToken: vi.fn().mockResolvedValue({ secure: false }),
  deleteToken: vi.fn().mockResolvedValue(undefined),
  isKeychainAvailable: vi.fn().mockResolvedValue(false),
}));

import {
  readConnections,
  writeConnections,
  addConnection,
  removeConnection,
  getConnection,
  getDefaultConnection,
  setDefault,
  listConnections,
  testConnection,
} from "../src/core/connections.js";
import { getConnectionsPath } from "../src/core/paths.js";
import { createTmpDir, removeTmpDir } from "./helpers.js";

let tmpDir: string;
let origHome: string;

beforeEach(async () => {
  tmpDir = await createTmpDir();
  origHome = process.env.HOME!;
  process.env.HOME = tmpDir;
  await fs.mkdir(`${tmpDir}/.spm`, { recursive: true });
});

afterEach(async () => {
  process.env.HOME = origHome;
  await removeTmpDir(tmpDir);
  vi.restoreAllMocks();
});

function spmDir(): string {
  return `${tmpDir}/.spm`;
}

describe("readConnections", () => {
  it("returns empty structure when file does not exist", async () => {
    const data = await readConnections(spmDir());
    expect(data.version).toBe(1);
    expect(data.connections).toEqual({});
  });

  it("reads existing file", async () => {
    const content = { version: 1, default: "test", connections: { test: { type: "openclaw", url: "https://example.com", label: "Test", token: "tok" } } };
    await fs.writeFile(getConnectionsPath(spmDir()), JSON.stringify(content));
    const data = await readConnections(spmDir());
    expect(data.default).toBe("test");
    expect(data.connections.test.url).toBe("https://example.com");
  });
});

describe("writeConnections", () => {
  it("creates file with 0600 permissions", async () => {
    await writeConnections({ version: 1, connections: {} }, spmDir());
    const stat = await fs.stat(getConnectionsPath(spmDir()));
    // Check owner read+write only (0600 = 384 decimal, but on macOS umask may differ)
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

describe("addConnection", () => {
  it("adds first connection and sets as default", async () => {
    // Keychain will fail in test env, token stored as plaintext
    await addConnection("prod", {
      type: "openclaw",
      url: "https://prod.example.com",
      token: "tok_prod",
      label: "Production",
    }, spmDir());

    const data = await readConnections(spmDir());
    expect(data.default).toBe("prod");
    expect(data.connections.prod).toBeDefined();
    expect(data.connections.prod.label).toBe("Production");
  });

  it("does not override default when adding second connection", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok", label: "Prod" }, spmDir());
    await addConnection("staging", { type: "openclaw", url: "https://staging.example.com", token: "tok2", label: "Staging" }, spmDir());

    const data = await readConnections(spmDir());
    expect(data.default).toBe("prod");
    expect(Object.keys(data.connections)).toHaveLength(2);
  });
});

describe("removeConnection", () => {
  it("removes existing connection", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok", label: "Prod" }, spmDir());
    const removed = await removeConnection("prod", spmDir());
    expect(removed).toBe(true);

    const data = await readConnections(spmDir());
    expect(data.connections.prod).toBeUndefined();
  });

  it("returns false for non-existent connection", async () => {
    const removed = await removeConnection("nope", spmDir());
    expect(removed).toBe(false);
  });

  it("cascades default when removing default connection", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok", label: "Prod" }, spmDir());
    await addConnection("staging", { type: "openclaw", url: "https://staging.example.com", token: "tok2", label: "Staging" }, spmDir());
    await removeConnection("prod", spmDir());

    const data = await readConnections(spmDir());
    expect(data.default).toBe("staging");
  });

  it("clears default when removing last connection", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok", label: "Prod" }, spmDir());
    await removeConnection("prod", spmDir());

    const data = await readConnections(spmDir());
    expect(data.default).toBeUndefined();
  });
});

describe("getConnection", () => {
  it("returns connection with resolved token", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok_secret", label: "Prod" }, spmDir());
    const conn = await getConnection("prod", spmDir());
    expect(conn).toBeDefined();
    expect(conn!.resolvedToken).toBe("tok_secret");
  });

  it("returns undefined for non-existent connection", async () => {
    const conn = await getConnection("nope", spmDir());
    expect(conn).toBeUndefined();
  });
});

describe("getDefaultConnection", () => {
  it("returns default connection", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok", label: "Prod" }, spmDir());
    const result = await getDefaultConnection(spmDir());
    expect(result).toBeDefined();
    expect(result!.name).toBe("prod");
  });

  it("returns undefined when no connections exist", async () => {
    const result = await getDefaultConnection(spmDir());
    expect(result).toBeUndefined();
  });
});

describe("setDefault", () => {
  it("sets default to existing connection", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok", label: "Prod" }, spmDir());
    await addConnection("staging", { type: "openclaw", url: "https://staging.example.com", token: "tok2", label: "Staging" }, spmDir());
    await setDefault("staging", spmDir());

    const data = await readConnections(spmDir());
    expect(data.default).toBe("staging");
  });

  it("throws for non-existent connection", async () => {
    await expect(setDefault("nope", spmDir())).rejects.toThrow('Connection "nope" not found');
  });
});

describe("listConnections", () => {
  it("returns empty array when no connections", async () => {
    const list = await listConnections(spmDir());
    expect(list).toEqual([]);
  });

  it("returns connections with default flag", async () => {
    await addConnection("prod", { type: "openclaw", url: "https://prod.example.com", token: "tok", label: "Prod" }, spmDir());
    await addConnection("staging", { type: "openclaw", url: "https://staging.example.com", token: "tok2", label: "Staging" }, spmDir());

    const list = await listConnections(spmDir());
    expect(list).toHaveLength(2);

    const prod = list.find((c) => c.name === "prod")!;
    expect(prod.isDefault).toBe(true);
    expect(prod.label).toBe("Prod");

    const staging = list.find((c) => c.name === "staging")!;
    expect(staging.isDefault).toBe(false);
  });
});

describe("testConnection", () => {
  it("returns error for non-existent connection", async () => {
    const result = await testConnection("nope", spmDir());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error on network failure", async () => {
    await addConnection("prod", {
      type: "openclaw",
      url: "http://127.0.0.1:1",
      token: "tok",
      label: "Prod",
    }, spmDir());

    const result = await testConnection("prod", spmDir());
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
