import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../../core/config.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { RegistryClient } from "../../core/registry-client.js";
import { packSkill } from "../../core/storage/index.js";
import { parseGitHubUrl } from "../../core/github/client.js";
import type { SkillManifest } from "../../types/index.js";
import { log, spinner, note, exitError, formatSize } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "publish",
  description: "Publish a skill to registry",
  group: "registry",
  args: [{ name: "source", required: true }],
  options: [
    { flags: "--registry <name>", description: "Publish to a specific registry" },
    { flags: "--github", description: "Source is a GitHub URL" },
    { flags: "--dry-run", description: "Show what would happen without executing" },
  ],
  handler: publishCommand,
};

export async function publishCommand(
  source: string,
  options: { registry?: string; github?: boolean; dryRun?: boolean },
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

  const isGitHub = options.github || source.includes("github.com") || source.startsWith("github:");

  if (isGitHub) {
    const s = spinner();
    s.start(`Publishing from GitHub: ${source}`);
    const ghSource = parseGitHubUrl(source);
    const result = await client.publish({
      manifest: {} as SkillManifest,
      content: "",
      source: {
        type: "github",
        url: source,
        ref: ghSource.ref,
        path: ghSource.path,
      },
    });

    s.stop(
      result.updated
        ? `Updated ${result.name}@${result.version}`
        : `Published ${result.name}@${result.version}`,
    );
    return;
  }

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

  if (!manifest.entry) {
    exitError("skill.json has no 'entry' field. Bundles cannot be published — only skills with an entry point.");
  }

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

  // Package skill directory into .tar.gz
  const s = spinner();
  s.start(`Packaging ${manifest.name}@${manifest.version}...`);
  const pkg = await packSkill(skillDir);

  if (options.dryRun) {
    s.stop("Done (dry-run)");
    note(
      `Would publish ${manifest.name}@${manifest.version} to ${reg.name}\nPackage size: ${formatSize(pkg.size)} (${pkg.filesCount} files)\nIntegrity: ${pkg.integrity}`,
      "Dry run",
    );
    return;
  }

  s.message(`Publishing ${manifest.name}@${manifest.version} to ${reg.name}...`);

  const result = await client.publishWithArchive(
    { manifest, content, compact_content: compactContent },
    pkg.data,
  );

  s.stop(
    result.updated
      ? `Updated ${result.name}@${result.version}`
      : `Published ${result.name}@${result.version}`,
  );
  log.info(`Size: ${formatSize(result.size ?? pkg.size)}`);
  log.info(`Tokens: ~${Math.ceil(content.length / 4).toLocaleString()}`);
}
