import { execFile } from "node:child_process";

export interface DialogResult {
  confirmed: boolean;
}

/**
 * Show a native OS confirmation dialog. Returns true if the user clicked OK/Yes.
 * Falls back to auto-reject if no dialog mechanism is available.
 */
export async function showConfirmDialog(
  title: string,
  message: string,
): Promise<DialogResult> {
  const platform = process.platform;

  if (platform === "darwin") {
    return showMacDialog(title, message);
  }

  if (platform === "win32") {
    return showWindowsDialog(title, message);
  }

  // Linux: try zenity, then kdialog, then reject
  return showLinuxDialog(title, message);
}

// Safe: uses execFile with argument arrays, no shell involved
function execSafe(cmd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 60_000 }, (error, stdout) => {
      const code = error?.code ?? (error ? 1 : 0);
      resolve({ code: typeof code === "number" ? code : 1, stdout: stdout ?? "" });
    });
  });
}

async function showMacDialog(title: string, message: string): Promise<DialogResult> {
  const script = `display dialog "${message}" with title "${title}" buttons {"Cancel", "Allow"} default button "Cancel" cancel button "Cancel"`;
  const { code } = await execSafe("osascript", ["-e", script]);
  return { confirmed: code === 0 };
}

async function showWindowsDialog(title: string, message: string): Promise<DialogResult> {
  const ps = `Add-Type -AssemblyName System.Windows.Forms; $r = [System.Windows.Forms.MessageBox]::Show('${message}','${title}','YesNo','Question'); if($r -eq 'Yes'){exit 0}else{exit 1}`;
  const { code } = await execSafe("powershell", ["-NoProfile", "-Command", ps]);
  return { confirmed: code === 0 };
}

async function showLinuxDialog(title: string, message: string): Promise<DialogResult> {
  // Try zenity first
  const zenity = await execSafe("zenity", [
    "--question",
    `--title=${title}`,
    `--text=${message}`,
    "--ok-label=Allow",
    "--cancel-label=Cancel",
  ]);
  if (zenity.code === 0) return { confirmed: true };

  // zenity returned non-zero — could be "Cancel" or "not found"
  // Try kdialog as fallback
  const kd = await execSafe("kdialog", [
    "--title", title,
    "--yesno", message,
  ]);
  if (kd.code === 0) return { confirmed: true };

  // No dialog mechanism available — auto-reject
  return { confirmed: false };
}
