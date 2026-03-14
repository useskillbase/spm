import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../../core/config.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { RegistryClient } from "../../core/registry-client.js";
import { packSkill } from "../../core/storage/index.js";
import type { SkillManifest } from "../../types/index.js";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
    console.error("Error: no default registry configured. Use 'skills login <url>' first.");
    process.exit(1);
  }

  const reg = config.registries.find((r) => r.name === registryName);
  if (!reg) {
    console.error(`Error: registry "${registryName}" not found in config.`);
    process.exit(1);
  }

  if (!reg.token) {
    console.error(`Error: no token for registry "${registryName}". Use 'skills login' first.`);
    process.exit(1);
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
      console.error("Invalid skill.json:");
      for (const error of validation.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
    manifest = data as SkillManifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Error: cannot read skill.json in "${source}".`);
      process.exit(1);
    }
    throw err;
  }

  // Verify skill exists in registry
  const existing = await client.getSkill(manifest.author, manifest.name);
  if (!existing) {
    console.error(`Error: "${manifest.author}/${manifest.name}" not found in registry. Use 'skills publish' for first-time publishing.`);
    process.exit(1);
  }

  const previousVersion = existing.version;

  if (!manifest.entry) {
    console.error("Error: skill.json has no 'entry' field. Bundles cannot be updated — only skills with an entry point.");
    process.exit(1);
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
  console.log(`Packaging ${manifest.name}@${manifest.version}...`);
  const pkg = await packSkill(skillDir);

  if (options.dryRun) {
    console.log(`[dry-run] Would update ${manifest.name}@${manifest.version} (was ${previousVersion})`);
    console.log(`  Package size: ${formatSize(pkg.size)} (${pkg.filesCount} files)`);
    console.log(`  Integrity: ${pkg.integrity}`);
    return;
  }

  // Publish (server handles update vs insert)
  console.log(`Updating ${manifest.name} in ${reg.name}...`);

  const result = await client.publishWithArchive(
    { manifest, content, compact_content: compactContent },
    pkg.data,
  );

  console.log(`Updated ${result.name}@${result.version} (was ${previousVersion})`);
  console.log(`  Size: ${formatSize(result.size ?? pkg.size)}`);
  console.log(`  Tokens: ~${Math.ceil(content.length / 4).toLocaleString()}`);
}
