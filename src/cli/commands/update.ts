import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../../core/config.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { RegistryClient } from "../../core/registry-client.js";
import { packSkill } from "../../core/storage/index.js";
import type { SkillManifest } from "../../types/index.js";
import { log, spinner, note, exitError, formatSize } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "update",
  description: "Update an existing skill in the registry (re-publish)",
  group: "registry",
  args: [{ name: "source", required: true }],
  options: [
    { flags: "--registry <name>", description: "Target registry" },
    { flags: "--dry-run", description: "Show what would happen without executing" },
  ],
  handler: updateCommand,
};

export async function updateCommand(
  source: string,
  options: { registry?: string; dryRun?: boolean },
): Promise<void> {
  const config = await readConfig();

  let registryName = options.registry;
  if (!registryName) {
    registryName = config.scopes["*"];
  }
  if (!registryName) {
    exitError("No default registry configured. Use 'skills login <url>' first.");
  }

  const reg = config.registries.find((r) => r.name === registryName);
  if (!reg) {
    exitError(`Registry "${registryName}" not found in config.`);
  }

  if (!reg.token) {
    exitError(`No token for registry "${registryName}". Use 'skills login' first.`);
  }

  const client = new RegistryClient(reg.url, reg.token);

  // Read and validate local skill
  const skillDir = path.resolve(source);
  const manifestPath = path.join(skillDir, "skill.json");

  let manifest: SkillManifest;
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    const validation = validateSkillManifest(data);
    if (!validation.valid) {
      exitError(`Invalid skill.json:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
    }
    manifest = data as SkillManifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      exitError(`Cannot read skill.json in "${source}".`);
    }
    throw err;
  }

  // Verify skill exists in registry
  const existing = await client.getSkill(manifest.author, manifest.name);
  if (!existing) {
    exitError(`"${manifest.author}/${manifest.name}" not found in registry. Use 'skills publish' for first-time publishing.`);
  }

  const previousVersion = existing.version;

  if (!manifest.entry) {
    exitError("skill.json has no 'entry' field. Bundles cannot be updated — only skills with an entry point.");
  }

  // Read entry content
  const entryPath = path.join(skillDir, manifest.entry);
  const content = await fs.readFile(entryPath, "utf-8");

  let compactContent: string | undefined;
  if (manifest.compact_entry) {
    try {
      compactContent = await fs.readFile(path.join(skillDir, manifest.compact_entry), "utf-8");
    } catch {
      // Optional
    }
  }

  // Package
  const s = spinner();
  s.start(`Packaging ${manifest.name}@${manifest.version}...`);
  const pkg = await packSkill(skillDir);

  if (options.dryRun) {
    s.stop("Done (dry-run)");
    note(
      `Would update ${manifest.name}@${manifest.version} (was ${previousVersion})\nPackage size: ${formatSize(pkg.size)} (${pkg.filesCount} files)\nIntegrity: ${pkg.integrity}`,
      "Dry run",
    );
    return;
  }

  // Publish (server handles update vs insert)
  s.message(`Updating ${manifest.name} in ${reg.name}...`);

  const result = await client.publishWithArchive(
    { manifest, content, compact_content: compactContent },
    pkg.data,
  );

  s.stop(`Updated ${result.name}@${result.version} (was ${previousVersion})`);
  log.info(`Size: ${formatSize(result.size ?? pkg.size)}`);
  log.info(`Tokens: ~${Math.ceil(content.length / 4).toLocaleString()}`);
}
