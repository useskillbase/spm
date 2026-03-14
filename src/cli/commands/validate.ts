import fs from "node:fs/promises";
import path from "node:path";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "validate",
  description: "Validate a skill directory",
  group: "system",
  args: [{ name: "path", required: true }],
  handler: validateCommand,
};

export async function validateCommand(skillPath: string): Promise<void> {
  const dir = path.resolve(skillPath);

  // Check directory exists
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      exitError(`"${skillPath}" is not a directory.`);
    }
  } catch {
    exitError(`"${skillPath}" does not exist.`);
  }

  // Check skill.json exists
  const manifestPath = path.join(dir, "skill.json");
  let rawManifest: string;
  try {
    rawManifest = await fs.readFile(manifestPath, "utf-8");
  } catch {
    exitError(`skill.json not found in "${skillPath}".`);
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(rawManifest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    exitError(`skill.json is not valid JSON: ${message}`);
  }

  // Validate against schema
  const result = validateSkillManifest(data);
  if (!result.valid) {
    exitError(`Validation failed:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  const manifest = data as { entry?: string; compact_entry?: string; name?: string };

  // Check entry file exists
  if (manifest.entry) {
    const entryPath = path.join(dir, manifest.entry);
    try {
      await fs.access(entryPath);
    } catch {
      exitError(`Entry file "${manifest.entry}" not found.`);
    }
  }

  // Check compact_entry if specified
  if (manifest.compact_entry) {
    const compactPath = path.join(dir, manifest.compact_entry);
    try {
      await fs.access(compactPath);
    } catch {
      exitError(`compact_entry file "${manifest.compact_entry}" not found.`);
    }
  }

  log.success(`Valid: ${manifest.name ?? skillPath}`);
}
