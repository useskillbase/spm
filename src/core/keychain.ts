import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SERVICE = "spm";
export const KEYCHAIN_SENTINEL = "__keychain__";

interface KeychainBackend {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, token: string): Promise<void>;
  delete(service: string, account: string): Promise<boolean>;
}

function createMacOSBackend(): KeychainBackend {
  return {
    async get(service, account) {
      try {
        const { stdout } = await execFileAsync("security", [
          "find-generic-password",
          "-s", service,
          "-a", account,
          "-w",
        ]);
        return stdout.trim();
      } catch {
        return null;
      }
    },
    async set(service, account, token) {
      // Delete existing entry first (add-generic-password fails if exists)
      try {
        await execFileAsync("security", [
          "delete-generic-password",
          "-s", service,
          "-a", account,
        ]);
      } catch {
        // OK if not found
      }
      await execFileAsync("security", [
        "add-generic-password",
        "-s", service,
        "-a", account,
        "-w", token,
      ]);
    },
    async delete(service, account) {
      try {
        await execFileAsync("security", [
          "delete-generic-password",
          "-s", service,
          "-a", account,
        ]);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function createLinuxBackend(): KeychainBackend {
  return {
    async get(service, account) {
      try {
        const { stdout } = await execFileAsync("secret-tool", [
          "lookup", "service", service, "account", account,
        ]);
        return stdout.trim();
      } catch {
        return null;
      }
    },
    async set(service, account, token) {
      await execFileAsync("secret-tool", [
        "store",
        "--label", `${service}: ${account}`,
        "service", service,
        "account", account,
      ], { input: token } as Parameters<typeof execFileAsync>[2]);
    },
    async delete(service, account) {
      try {
        await execFileAsync("secret-tool", [
          "clear", "service", service, "account", account,
        ]);
        return true;
      } catch {
        return false;
      }
    },
  };
}

let cachedBackend: KeychainBackend | null | undefined;

function getBackend(): KeychainBackend | null {
  if (cachedBackend !== undefined) return cachedBackend;

  if (process.platform === "darwin") {
    cachedBackend = createMacOSBackend();
  } else if (process.platform === "linux") {
    cachedBackend = createLinuxBackend();
  } else {
    cachedBackend = null;
  }
  return cachedBackend;
}

export async function isKeychainAvailable(): Promise<boolean> {
  const backend = getBackend();
  if (!backend) return false;

  try {
    if (process.platform === "darwin") {
      await execFileAsync("security", ["list-keychains"]);
      return true;
    }
    if (process.platform === "linux") {
      await execFileAsync("which", ["secret-tool"]);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function setToken(
  connectionName: string,
  token: string,
): Promise<{ secure: boolean }> {
  const backend = getBackend();
  if (backend) {
    try {
      await backend.set(SERVICE, connectionName, token);
      return { secure: true };
    } catch {
      // Fall through to plaintext
    }
  }
  return { secure: false };
}

export async function getToken(connectionName: string): Promise<string | null> {
  const backend = getBackend();
  if (backend) {
    try {
      const token = await backend.get(SERVICE, connectionName);
      if (token) return token;
    } catch {
      // Fall through
    }
  }
  return null;
}

export async function deleteToken(connectionName: string): Promise<void> {
  const backend = getBackend();
  if (backend) {
    try {
      await backend.delete(SERVICE, connectionName);
    } catch {
      // Ignore
    }
  }
}

/** Reset cached backend — for testing only */
export function _resetBackendCache(): void {
  cachedBackend = undefined;
}
