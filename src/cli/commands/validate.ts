import fs from "node:fs/promises";
import path from "node:path";
import { validateSkillManifest } from "../../schema/skill-schema.js";

export async function validateCommand(skillPath: string): Promise<void> {
  const dir = path.resolve(skillPath);

  // Check directory exists
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      console.error(`Error: "${skillPath}" is not a directory.`);
      process.exit(1);
    }
  } catch {
    console.error(`Error: "${skillPath}" does not exist.`);
    process.exit(1);
  }

  // Check skill.json exists
  const manifestPath = path.join(dir, "skill.json");
  let rawManifest: string;
  try {
    rawManifest = await fs.readFile(manifestPath, "utf-8");
  } catch {
    console.error(`Error: skill.json not found in "${skillPath}".`);
    process.exit(1);
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(rawManifest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: skill.json is not valid JSON: ${message}`);
    process.exit(1);
  }

  // Validate against schema
  const result = validateSkillManifest(data);
  if (!result.valid) {
    console.error("Validation failed:");
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const manifest = data as { entry?: string; compact_entry?: string; name?: string };

  // Check entry file exists
  if (manifest.entry) {
    const entryPath = path.join(dir, manifest.entry);
    try {
      await fs.access(entryPath);
    } catch {
      console.error(`Error: entry file "${manifest.entry}" not found.`);
      process.exit(1);
    }
  }

  // Check compact_entry if specified
  if (manifest.compact_entry) {
    const compactPath = path.join(dir, manifest.compact_entry);
    try {
      await fs.access(compactPath);
    } catch {
      console.error(`Error: compact_entry file "${manifest.compact_entry}" not found.`);
      process.exit(1);
    }
  }

  console.log(`Valid: ${manifest.name ?? skillPath}`);
}
