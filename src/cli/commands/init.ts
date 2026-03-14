import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSkillsDir, getProjectSkillsDir, getInstalledDir, getManifestPath } from "../../core/paths.js";
import { getDefaultConfig } from "../../core/config.js";
import { getDefaultManifest } from "../../core/manifest.js";

async function createStructure(skillsDir: string, label: string): Promise<void> {
  const installedDir = getInstalledDir(skillsDir);
  const configPath = path.join(skillsDir, "config.json");
  const feedbackPath = path.join(skillsDir, "feedback.json");
  const cachePath = path.join(skillsDir, "cache");

  await fs.mkdir(installedDir, { recursive: true });
  await fs.mkdir(cachePath, { recursive: true });

  // Write config.json only if it doesn't exist
  try {
    await fs.access(configPath);
  } catch {
    await fs.writeFile(configPath, JSON.stringify(getDefaultConfig(), null, 2) + "\n", "utf-8");
  }

  // Write empty feedback.json only if it doesn't exist
  try {
    await fs.access(feedbackPath);
  } catch {
    await fs.writeFile(feedbackPath, JSON.stringify({ entries: [] }, null, 2) + "\n", "utf-8");
  }

  console.log(`Initialized ${label} skills directory: ${skillsDir}`);
  console.log(`  installed/   — skill packages`);
  console.log(`  config.json  — settings`);
  console.log(`  feedback.json — usage feedback`);
  console.log(`  cache/       — download cache`);
}

export async function initCommand(options: { project?: boolean }): Promise<void> {
  if (options.project) {
    const cwd = process.cwd();
    const dir = getProjectSkillsDir(cwd);
    await createStructure(dir, "project");

    // Create skill.json in project root if it doesn't exist
    const manifestPath = getManifestPath(cwd);
    try {
      await fs.access(manifestPath);
    } catch {
      await fs.writeFile(
        manifestPath,
        JSON.stringify(getDefaultManifest(), null, 2) + "\n",
        "utf-8",
      );
      console.log(`  skill.json   — project dependencies`);
    }
  } else {
    const dir = getGlobalSkillsDir();
    await createStructure(dir, "global");
  }
}
