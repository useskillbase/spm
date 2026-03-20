import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "./config.js";
import { getClientForSkill } from "./registry-client.js";
import { unpackSkill, computeIntegrity } from "./storage/packager.js";
import { writeIndex } from "./indexer.js";
import { writeLock } from "./lock.js";
import { getGlobalSkillsDir, getInstalledDir } from "./paths.js";
import type { SkillManifest } from "../types/index.js";

export type StepCallback = (step: string, label: string) => void;

function parseSkillRef(ref: string): { author: string; name: string } | null {
  const match = ref.match(/^@?([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (!match) return null;
  return { author: match[1], name: match[2] };
}

export async function installSkill(
  packageName: string,
  version?: string,
  onStep?: StepCallback,
): Promise<void> {
  const parsed = parseSkillRef(packageName);
  if (!parsed) throw new Error(`Invalid package name: ${packageName}`);

  const { author, name } = parsed;
  const skillsDir = getGlobalSkillsDir();

  onStep?.("resolving", `Resolving @${author}/${name}...`);

  const config = await readConfig();
  const client = getClientForSkill(config, `${author}/${name}`);
  if (!client) throw new Error(`No registry configured for "${author}/${name}".`);

  const downloadResult = await client.getDownloadUrl(author, name, version);
  const manifest = downloadResult.manifest as unknown as SkillManifest;

  if (!downloadResult.download_url) {
    throw new Error("Registry returned no download URL.");
  }

  onStep?.("downloading", `Downloading @${author}/${name}@${manifest.version}...`);

  const archiveRes = await fetch(downloadResult.download_url);
  if (!archiveRes.ok) {
    throw new Error(`Download failed: ${archiveRes.status} ${archiveRes.statusText}`);
  }
  const archiveData = Buffer.from(await archiveRes.arrayBuffer());

  if (downloadResult.integrity) {
    const actual = computeIntegrity(archiveData);
    if (actual !== downloadResult.integrity) {
      throw new Error(`Integrity mismatch. Expected: ${downloadResult.integrity}, Got: ${actual}`);
    }
  }

  onStep?.("installing", "Installing...");

  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, manifest.name);
  await fs.rm(dest, { recursive: true, force: true });
  await unpackSkill(archiveData, dest);

  onStep?.("indexing", "Updating index...");

  await writeIndex(skillsDir);
  await writeLock(skillsDir);
}

export async function removeSkill(
  packageName: string,
  onStep?: StepCallback,
): Promise<void> {
  const parsed = parseSkillRef(packageName);
  if (!parsed) throw new Error(`Invalid package name: ${packageName}`);

  const { author, name } = parsed;
  const skillsDir = getGlobalSkillsDir();
  const installedDir = getInstalledDir(skillsDir);
  const skillDir = path.join(installedDir, author, name);

  try {
    await fs.access(skillDir);
  } catch {
    throw new Error(`Package "@${author}/${name}" is not installed.`);
  }

  onStep?.("removing", `Removing @${author}/${name}...`);

  await fs.rm(skillDir, { recursive: true });

  // Clean up empty author directory
  const authorDir = path.join(installedDir, author);
  const remaining = await fs.readdir(authorDir);
  if (remaining.length === 0) {
    await fs.rmdir(authorDir);
  }

  onStep?.("indexing", "Updating index...");

  await writeIndex(skillsDir);
  await writeLock(skillsDir);
}
