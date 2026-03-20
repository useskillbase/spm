import fs from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";
import { startServer, stopServer, readStatusPort } from "../../core/status-server.js";
import { getGlobalSkillsDir, getStatusPidPath, getStatusPortPath } from "../../core/paths.js";

export const command: CommandDef = {
  name: "status-server",
  description: "Manage the local status server",
  group: "system",
  subcommands: [
    {
      name: "start",
      description: "Start the status server in background",
      group: "system",
      handler: startCommand,
    },
    {
      name: "stop",
      description: "Stop the status server",
      group: "system",
      handler: stopCommand,
    },
    {
      name: "status",
      description: "Show status server info",
      group: "system",
      handler: statusCommand,
    },
    {
      name: "__daemon",
      description: "",
      group: "system",
      handler: daemonCommand,
    },
  ],
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

async function isRunning(): Promise<{ running: boolean; port: number }> {
  const port = await readStatusPort();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/status`, {
      signal: AbortSignal.timeout(2_000),
    });
    return { running: response.ok, port };
  } catch {
    return { running: false, port };
  }
}

async function startCommand(): Promise<void> {
  const { running, port } = await isRunning();
  if (running) {
    log.info(`Status server already running on port ${port}.`);
    return;
  }

  const binPath = getSkillsBin();
  const child = spawn(process.execPath, [binPath, "status-server", "__daemon"], {
    detached: true,
    stdio: "ignore",
  });

  // Write PID
  const spmDir = getGlobalSkillsDir();
  await fs.mkdir(spmDir, { recursive: true });
  await fs.writeFile(getStatusPidPath(), String(child.pid), "utf-8");
  child.unref();

  // Brief wait then verify
  await new Promise((r) => setTimeout(r, 500));
  const check = await isRunning();
  if (check.running) {
    log.success(`Status server started on port ${check.port}.`);
  } else {
    log.warning("Status server spawned but not yet responding. Check: spm status-server status");
  }
}

async function stopCommand(): Promise<void> {
  const pidPath = getStatusPidPath();
  let pid: number | undefined;

  try {
    const content = await fs.readFile(pidPath, "utf-8");
    pid = parseInt(content.trim(), 10);
  } catch {
    // No PID file
  }

  if (pid && Number.isFinite(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process may already be dead
    }
  }

  // Cleanup files
  try { await fs.unlink(pidPath); } catch { /* ignore */ }
  try { await fs.unlink(getStatusPortPath()); } catch { /* ignore */ }

  log.success("Status server stopped.");
}

async function statusCommand(): Promise<void> {
  const { running, port } = await isRunning();
  if (running) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`, {
        signal: AbortSignal.timeout(2_000),
      });
      const data = await response.json() as { spm_version: string; connections: unknown[] };
      log.success(`Running on port ${port}`);
      log.message(`spm version: ${data.spm_version}`);
      log.message(`Connections: ${data.connections.length}`);
    } catch {
      log.info(`Running on port ${port} (details unavailable)`);
    }
  } else {
    log.info("Status server is not running.");
    log.message("Start with: spm status-server start");
  }
}

async function daemonCommand(): Promise<void> {
  const { server, port } = await startServer();

  // Write PID for stop command
  const spmDir = getGlobalSkillsDir();
  await fs.mkdir(spmDir, { recursive: true });
  await fs.writeFile(getStatusPidPath(), String(process.pid), "utf-8");

  const shutdown = () => {
    stopServer(server).catch(() => {}).finally(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
