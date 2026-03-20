import fs from "node:fs/promises";
import { realpathSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname_esm = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the absolute path to the spm CLI entry point */
function getSpmBinPathSync(): string {
  // Walk up from this file to find dist/cli/index.js
  // This file is at dist/core/protocol/register.js
  let dir = __dirname_esm;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "dist", "cli", "index.js");
    if (existsSync(candidate)) {
      return realpathSync(candidate);
    }
    const candidate2 = path.join(dir, "cli", "index.js");
    if (existsSync(candidate2)) {
      return realpathSync(candidate2);
    }
    dir = path.dirname(dir);
  }

  // Fallback: resolve from npm global prefix
  try {
    const npmPrefix = execFileSync("npm", ["prefix", "-g"], { encoding: "utf-8" }).trim();
    const globalEntry = path.join(npmPrefix, "lib", "node_modules", "@skillbase", "spm", "dist", "cli", "index.js");
    if (existsSync(globalEntry)) {
      return realpathSync(globalEntry);
    }
  } catch {
    // ignore
  }

  return "spm";
}

function execSafe(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 30_000 }, (error, stdout, stderr) => {
      const code = error?.code ?? (error ? 1 : 0);
      resolve({
        code: typeof code === "number" ? code : 1,
        stdout: stdout ?? "",
        stderr: stderr ?? "",
      });
    });
  });
}

// -- macOS --

const PLIST_BUNDLE_ID = "space.skillbase.spm";


async function registerMacOS(): Promise<void> {
  const home = os.homedir();
  const appPath = path.join(home, "Applications", "spm.app");

  // Clean previous installation
  try { await fs.rm(appPath, { recursive: true, force: true }); } catch { /* ignore */ }

  const nodePath = process.execPath;
  const spmPath = getSpmBinPathSync();

  // Write AppleScript source to temp file
  const scriptSrc = `on open location theURL
  do shell script quoted form of "${nodePath}" & " " & quoted form of "${spmPath}" & " protocol-handle " & quoted form of theURL
end open location`;

  const tmpScript = path.join(os.tmpdir(), "spm-protocol.applescript");
  await fs.writeFile(tmpScript, scriptSrc, "utf-8");

  // Compile into a real .app bundle using osacompile
  const result = await execSafe("osacompile", ["-o", appPath, tmpScript]);
  if (result.code !== 0) {
    throw new Error(`osacompile failed: ${result.stderr}`);
  }

  await fs.unlink(tmpScript).catch(() => {});

  // Patch Info.plist to add URL scheme before the last </dict></plist>
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  const plistRaw = await fs.readFile(plistPath, "utf-8");

  const urlTypes = `\t<key>CFBundleIdentifier</key>
\t<string>${PLIST_BUNDLE_ID}</string>
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>spm Protocol</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>spm</string>
\t\t\t</array>
\t\t</dict>
\t</array>`;

  const patched = plistRaw.replace("</dict>\n</plist>", `${urlTypes}\n</dict>\n</plist>`);
  await fs.writeFile(plistPath, patched, "utf-8");

  // Register with Launch Services
  await execSafe("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", [
    "-R", "-f", appPath,
  ]);
}

async function unregisterMacOS(): Promise<void> {
  const home = os.homedir();
  const appPath = path.join(home, "Applications", "spm.app");

  await execSafe("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", [
    "-R", "-u", appPath,
  ]);

  try {
    await fs.rm(appPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// -- Linux --

function buildDesktopEntry(nodePath: string, spmPath: string): string {
  return `[Desktop Entry]
Type=Application
Name=spm
Exec="${nodePath}" "${spmPath}" protocol-handle %u
MimeType=x-scheme-handler/spm;
NoDisplay=true
Terminal=false
`;
}

async function registerLinux(): Promise<void> {
  const home = os.homedir();
  const appsDir = path.join(home, ".local", "share", "applications");
  await fs.mkdir(appsDir, { recursive: true });

  const nodePath = process.execPath;
  const spmPath = getSpmBinPathSync();

  const desktopPath = path.join(appsDir, "spm-protocol.desktop");
  await fs.writeFile(desktopPath, buildDesktopEntry(nodePath, spmPath), "utf-8");

  // Register as handler for spm:// scheme
  await execSafe("xdg-mime", ["default", "spm-protocol.desktop", "x-scheme-handler/spm"]);
}

async function unregisterLinux(): Promise<void> {
  const home = os.homedir();
  const desktopPath = path.join(home, ".local", "share", "applications", "spm-protocol.desktop");

  try {
    await fs.unlink(desktopPath);
  } catch {
    // ignore
  }
}

// -- Windows --

async function registerWindows(): Promise<void> {
  const nodePath = process.execPath;
  const spmPath = getSpmBinPathSync();
  const command = `"${nodePath}" "${spmPath}" protocol-handle "%1"`;

  // Register spm:// scheme in HKCU
  const regCommands = [
    ["reg", "add", "HKCU\\Software\\Classes\\spm", "/ve", "/d", "URL:spm Protocol", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\spm", "/v", "URL Protocol", "/d", "", "/f"],
    ["reg", "add", "HKCU\\Software\\Classes\\spm\\shell\\open\\command", "/ve", "/d", command, "/f"],
  ];

  for (const [cmd, ...args] of regCommands) {
    await execSafe(cmd, args);
  }
}

async function unregisterWindows(): Promise<void> {
  await execSafe("reg", ["delete", "HKCU\\Software\\Classes\\spm", "/f"]);
}

// -- Public API --

export async function registerProtocol(): Promise<void> {
  const platform = process.platform;

  if (platform === "darwin") {
    await registerMacOS();
  } else if (platform === "linux") {
    await registerLinux();
  } else if (platform === "win32") {
    await registerWindows();
  } else {
    throw new Error(`Protocol registration not supported on ${platform}`);
  }
}

export async function unregisterProtocol(): Promise<void> {
  const platform = process.platform;

  if (platform === "darwin") {
    await unregisterMacOS();
  } else if (platform === "linux") {
    await unregisterLinux();
  } else if (platform === "win32") {
    await unregisterWindows();
  }
}

export function isSupported(): boolean {
  return ["darwin", "linux", "win32"].includes(process.platform);
}
