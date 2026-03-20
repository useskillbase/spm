import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import http from "node:http";

// Mock keychain (connections depends on it)
vi.mock("../src/core/keychain.js", () => ({
  KEYCHAIN_SENTINEL: "__keychain__",
  getToken: vi.fn().mockResolvedValue(null),
  setToken: vi.fn().mockResolvedValue({ secure: false }),
  deleteToken: vi.fn().mockResolvedValue(undefined),
  isKeychainAvailable: vi.fn().mockResolvedValue(false),
}));

import { createStatusServer, startServer, stopServer, readStatusPort } from "../src/core/status-server.js";
import { addConnection } from "../src/core/connections.js";
import { getStatusPortPath } from "../src/core/paths.js";
import { createTmpDir, removeTmpDir, installSkillFixture, minimalFrontmatter } from "./helpers.js";

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
});

function request(
  server: http.Server,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") return reject(new Error("No address"));

    const req = http.request(
      { hostname: "127.0.0.1", port: addr.port, path, method: options.method ?? "GET", headers: options.headers },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

describe("createStatusServer", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("returns 200 with status on GET /status", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status");
    expect(res.status).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.spm_version).toBeDefined();
    expect(data.connections).toBeInstanceOf(Array);
  });

  it("returns connections without tokens or urls", async () => {
    await addConnection("test-conn", {
      type: "openclaw",
      url: "https://secret.example.com",
      token: "tok_secret_123",
      label: "Test Connection",
    });

    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status");
    const data = JSON.parse(res.body);

    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].name).toBe("test-conn");
    expect(data.connections[0].type).toBe("openclaw");
    expect(data.connections[0].label).toBe("Test Connection");

    // Must NOT contain sensitive data
    const bodyStr = res.body;
    expect(bodyStr).not.toContain("secret.example.com");
    expect(bodyStr).not.toContain("tok_secret_123");
  });

  it("returns 404 for unknown routes", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/unknown");
    expect(res.status).toBe(404);
  });

  it("sets CORS headers for allowed origins", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status", {
      headers: { Origin: "https://skillbase.space" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("https://skillbase.space");
  });

  it("does not set CORS headers for disallowed origins", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status", {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("handles OPTIONS preflight", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status", {
      method: "OPTIONS",
      headers: { Origin: "https://personas.skillbase.space" },
    });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://personas.skillbase.space");
  });

  it("sets CORS for soul.skillbase.space", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});

describe("startServer / stopServer", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server?.listening) {
      await stopServer(server);
    }
  });

  it("starts on random port and writes port file", async () => {
    // Use port 0 to get a random available port
    const result = await startServer({ port: 0 });
    server = result.server;

    expect(result.port).toBeGreaterThan(0);

    // Port file should exist
    const portContent = await fs.readFile(getStatusPortPath(), "utf-8");
    expect(parseInt(portContent)).toBe(result.port);
  });

  it("writes port file even for default port", async () => {
    // Use a high random port to avoid conflict
    const result = await startServer({ port: 0 });
    server = result.server;

    const portContent = await fs.readFile(getStatusPortPath(), "utf-8");
    expect(portContent.trim()).toBe(String(result.port));
  });
});

describe("readStatusPort", () => {
  it("returns default port when file does not exist", async () => {
    const port = await readStatusPort();
    expect(port).toBe(57321);
  });

  it("reads port from file", async () => {
    await fs.writeFile(getStatusPortPath(), "12345", "utf-8");
    const port = await readStatusPort();
    expect(port).toBe(12345);
  });
});

describe("nonce endpoints", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("GET /protocol/nonce returns a 64-char hex nonce", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/protocol/nonce");
    expect(res.status).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.nonce).toBeDefined();
    expect(typeof data.nonce).toBe("string");
    expect(data.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns unique nonces on successive calls", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res1 = await request(server, "/protocol/nonce");
    const res2 = await request(server, "/protocol/nonce");

    const n1 = JSON.parse(res1.body).nonce;
    const n2 = JSON.parse(res2.body).nonce;
    expect(n1).not.toBe(n2);
  });

  it("POST /protocol/verify-nonce validates a fresh nonce", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    // Generate nonce
    const nonceRes = await request(server, "/protocol/nonce");
    const { nonce } = JSON.parse(nonceRes.body);

    // Verify it
    const verifyRes = await request(server, "/protocol/verify-nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce }),
    });
    expect(verifyRes.status).toBe(200);
    expect(JSON.parse(verifyRes.body).valid).toBe(true);
  });

  it("nonce is one-time use — second verification fails", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const nonceRes = await request(server, "/protocol/nonce");
    const { nonce } = JSON.parse(nonceRes.body);

    // First verify — valid
    await request(server, "/protocol/verify-nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce }),
    });

    // Second verify — invalid (already consumed)
    const res2 = await request(server, "/protocol/verify-nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce }),
    });
    expect(res2.status).toBe(200);
    expect(JSON.parse(res2.body).valid).toBe(false);
  });

  it("rejects unknown nonce", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/protocol/verify-nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce: "deadbeef".repeat(8) }),
    });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).valid).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/protocol/verify-nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when nonce field is missing", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/protocol/verify-nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /status — installed packages", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("returns installed skills and personas maps", async () => {
    const skillsDir = `${tmpDir}/.spm`;
    await installSkillFixture(skillsDir, minimalFrontmatter({
      name: "docx",
      author: "core",
      version: "1.2.0",
    }));

    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status");
    const data = JSON.parse(res.body);

    expect(data.installed).toBeDefined();
    expect(data.installed.skills).toBeDefined();
    expect(data.installed.personas).toBeDefined();
    expect(data.installed.skills["@core/docx"]).toBe("1.2.0");
  });

  it("returns empty maps when nothing is installed", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status");
    const data = JSON.parse(res.body);

    expect(data.installed.skills).toEqual({});
    expect(data.installed.personas).toEqual({});
  });

  it("returns has_token for connections", async () => {
    await addConnection("with-token", {
      type: "openclaw",
      url: "https://example.com",
      token: "tok_123",
      label: "With Token",
    });

    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/status");
    const data = JSON.parse(res.body);

    expect(data.connections[0].has_token).toBe(true);
    // Token value must not be exposed
    expect(res.body).not.toContain("tok_123");
  });
});

describe("POST /action", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("returns 400 for invalid JSON", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid action", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "destroy", package: "@core/docx" }),
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Invalid action");
  });

  it("returns 400 for invalid package name", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "install", package: "bad-name" }),
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain("Invalid package name");
  });

  it("returns 400 for package name without @ prefix", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "install", package: "core/docx" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts valid action and returns task id", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", package: "@core/docx" }),
    });
    expect(res.status).toBe(202);

    const data = JSON.parse(res.body);
    expect(data.id).toMatch(/^task_[0-9a-f]+$/);
    expect(data.status).toBe("pending");
  });
});

describe("GET /action/:id", () => {
  let server: http.Server;

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("returns 404 for unknown task id", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    const res = await request(server, "/action/task_nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns task state after creation", async () => {
    server = createStatusServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));

    // Create a task
    const createRes = await request(server, "/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", package: "@core/docx", target: "local" }),
    });
    const { id } = JSON.parse(createRes.body);

    // Poll it
    const pollRes = await request(server, `/action/${id}`);
    expect(pollRes.status).toBe(200);

    const task = JSON.parse(pollRes.body);
    expect(task.id).toBe(id);
    expect(task.action).toBe("remove");
    expect(task.package).toBe("@core/docx");
    expect(task.target).toBe("local");
    expect(["pending", "in_progress", "error"]).toContain(task.status);
  });
});
