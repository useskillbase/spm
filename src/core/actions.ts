import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "./config.js";
import { getClientForSkill, RegistryClient } from "./registry-client.js";
import { unpackSkill, computeIntegrity } from "./storage/packager.js";
import { writeIndex } from "./indexer.js";
import { writeLock } from "./lock.js";
import { getGlobalSkillsDir, getInstalledDir } from "./paths.js";
import { parseSkill } from "./skill-parser.js";
import { parseSoul } from "./persona-parser.js";
import { validateSkillFrontmatter } from "../schema/skill-schema.js";
import { validateSoulFrontmatter } from "../schema/persona-schema.js";
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

export interface PublishOptions {
  content: string;
  filename?: string;
  visibility?: "public" | "private";
}

export async function publishSkill(
  options: PublishOptions,
  onStep?: StepCallback,
): Promise<{ name: string; version: string }> {
  onStep?.("parsing", "Parsing content...");

  const { content, filename } = options;
  const isPersona = filename === "SOUL.md" || (!filename && content.includes("skillbase:"));

  let manifest: SkillManifest;

  if (isPersona) {
    const parsed = parseSoul(content);
    const validation = validateSoulFrontmatter(parsed.frontmatter);
    if (!validation.valid) {
      throw new Error(`Invalid SOUL.md:\n${validation.errors.map((e: string) => `  - ${e}`).join("\n")}`);
    }
    const fm = parsed.frontmatter;
    const trigger = fm.skillbase?.trigger;
    manifest = {
      schema_version: fm.skillbase?.schema_version ?? 3,
      name: fm.name,
      version: fm.version,
      language: "en",
      description: fm.description,
      trigger: trigger ? { description: trigger.description, tags: trigger.tags ?? [], priority: trigger.priority ?? 50 } : undefined,
      dependencies: {},
      entry: "SOUL.md",
      author: fm.author,
      license: fm.license,
    } as SkillManifest;
  } else {
    const parsed = parseSkill(content);
    const validation = validateSkillFrontmatter(parsed.frontmatter);
    if (!validation.valid) {
      throw new Error(`Invalid SKILL.md:\n${validation.errors.map((e: string) => `  - ${e}`).join("\n")}`);
    }
    const fm = parsed.frontmatter;
    manifest = {
      schema_version: fm.schema_version,
      name: fm.name,
      version: fm.version,
      language: fm.language,
      description: fm.description,
      trigger: fm.trigger,
      dependencies: fm.dependencies ?? {},
      compatibility: fm.compatibility,
      entry: "SKILL.md",
      security: fm.security,
      works_with: fm.works_with,
      author: fm.author,
      license: fm.license,
      repository: fm.repository,
      docs: fm.docs,
    };
  }

  onStep?.("validating", `Validating ${manifest.name}@${manifest.version}...`);

  const config = await readConfig();
  const registryName = config.scopes["*"];
  if (!registryName) throw new Error("No default registry configured. Use 'spm login' first.");
  const reg = config.registries.find((r) => r.name === registryName);
  if (!reg) throw new Error(`Registry "${registryName}" not found in config.`);
  if (!reg.token) throw new Error(`No token for registry "${registryName}". Use 'spm login' first.`);

  const client = new RegistryClient(reg.url, reg.token);

  onStep?.("publishing", `Publishing ${manifest.name}@${manifest.version}...`);

  const result = await client.publish({
    manifest,
    content,
    visibility: options.visibility,
  });

  return { name: result.name, version: result.version };
}
