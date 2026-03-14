import { intro, outro, spinner, note, cancel, isCancel, text, select, multiselect, confirm } from "@clack/prompts";

export { intro, outro, spinner, note, cancel, isCancel, text, select, multiselect, confirm };
export { log } from "./logger.js";

/** Styled error message + process.exit(1) */
export function exitError(message: string): never {
  cancel(message);
  process.exit(1);
}

/** Format byte sizes for display */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
