import fs from "node:fs/promises";
import path from "node:path";
import { getConnectionsPath } from "./paths.js";
import { KEYCHAIN_SENTINEL, getToken as keychainGet, setToken as keychainSet, deleteToken as keychainDelete } from "./keychain.js";

export interface Connection {
  type: "openclaw";
  url: string;
  token?: string;
  label: string;
  verified_at?: string;
}

export interface ConnectionsFile {
  version: 1;
  default?: string;
  connections: Record<string, Connection>;
}

function empty(): ConnectionsFile {
  return { version: 1, connections: {} };
}

export async function readConnections(skillsDir?: string): Promise<ConnectionsFile> {
  const filePath = getConnectionsPath(skillsDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ConnectionsFile;
  } catch {
    return empty();
  }
}

export async function writeConnections(data: ConnectionsFile, skillsDir?: string): Promise<void> {
  const filePath = getConnectionsPath(skillsDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export async function addConnection(
  name: string,
  conn: Connection,
  skillsDir?: string,
): Promise<{ secure: boolean }> {
  const data = await readConnections(skillsDir);

  // Store token in keychain if possible
  let secure = false;
  if (conn.token) {
    const result = await keychainSet(name, conn.token);
    secure = result.secure;
  }

  // Save connection entry
  const entry: Connection = { ...conn };
  if (secure) {
    entry.token = KEYCHAIN_SENTINEL;
  }

  data.connections[name] = entry;

  // Auto-set default if first connection
  if (Object.keys(data.connections).length === 1) {
    data.default = name;
  }

  await writeConnections(data, skillsDir);
  return { secure };
}

export async function removeConnection(name: string, skillsDir?: string): Promise<boolean> {
  const data = await readConnections(skillsDir);
  if (!data.connections[name]) return false;

  delete data.connections[name];

  // Cascade default
  if (data.default === name) {
    const remaining = Object.keys(data.connections);
    data.default = remaining.length > 0 ? remaining[0] : undefined;
  }

  await keychainDelete(name);
  await writeConnections(data, skillsDir);
  return true;
}

export async function getConnection(
  name: string,
  skillsDir?: string,
): Promise<(Connection & { resolvedToken?: string }) | undefined> {
  const data = await readConnections(skillsDir);
  const conn = data.connections[name];
  if (!conn) return undefined;

  let resolvedToken: string | undefined;
  if (conn.token === KEYCHAIN_SENTINEL) {
    resolvedToken = (await keychainGet(name)) ?? undefined;
  } else if (conn.token) {
    resolvedToken = conn.token;
  }

  return { ...conn, resolvedToken };
}

export async function getDefaultConnection(
  skillsDir?: string,
): Promise<{ name: string; connection: Connection; resolvedToken?: string } | undefined> {
  const data = await readConnections(skillsDir);
  const name = data.default ?? Object.keys(data.connections)[0];
  if (!name || !data.connections[name]) return undefined;

  const conn = await getConnection(name, skillsDir);
  if (!conn) return undefined;

  return { name, connection: conn, resolvedToken: conn.resolvedToken };
}

export async function setDefault(name: string, skillsDir?: string): Promise<void> {
  const data = await readConnections(skillsDir);
  if (!data.connections[name]) {
    throw new Error(`Connection "${name}" not found`);
  }
  data.default = name;
  await writeConnections(data, skillsDir);
}

export interface ConnectionListEntry {
  name: string;
  type: string;
  label: string;
  has_token: boolean;
  isDefault: boolean;
  verified_at?: string;
}

export async function listConnections(skillsDir?: string): Promise<ConnectionListEntry[]> {
  const data = await readConnections(skillsDir);
  return Object.entries(data.connections).map(([name, conn]) => ({
    name,
    type: conn.type,
    label: conn.label,
    has_token: conn.token != null && conn.token.length > 0,
    isDefault: data.default === name,
    verified_at: conn.verified_at,
  }));
}

export async function testConnection(
  name: string,
  skillsDir?: string,
): Promise<{ ok: boolean; error?: string }> {
  const conn = await getConnection(name, skillsDir);
  if (!conn) return { ok: false, error: `Connection "${name}" not found` };

  try {
    const response = await fetch(`${conn.url}/health`, {
      headers: conn.resolvedToken
        ? { Authorization: `Bearer ${conn.resolvedToken}` }
        : {},
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { ok: false, error: `Server returned ${response.status}` };
    }

    // Update verified_at
    const data = await readConnections(skillsDir);
    if (data.connections[name]) {
      data.connections[name].verified_at = new Date().toISOString();
      await writeConnections(data, skillsDir);
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
