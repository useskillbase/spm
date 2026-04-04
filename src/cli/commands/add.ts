import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { readConfig } from "../../core/config.js";
import { getClientForSkill, RegistryClient } from "../../core/registry-client.js";
import { parseSkillFile } from "../../core/skill-parser.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { getGlobalSkillsDir, getProjectSkillsDir, getInstalledDir } from "../../core/paths.js";
import { downloadSkillFiles, parseGitHubUrl } from "../../core/github/client.js";
import { unpackSkill, computeIntegrity } from "../../core/storage/packager.js";
import { resolveDependencies } from "../../core/resolver.js";
import { addSkillDependency, addPersonaDependency } from "../../core/manifest.js";
import { convertVercelToSpm, isVercelFormat } from "../../core/converters/vercel-to-spm.js";
import { serializeSkill } from "../../core/skill-parser.js";
import type { SkillManifest } from "../../types/index.js";
import { log, spinner, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export type PackageType = "skill" | "persona";

export interface InstallResult {
  manifest: SkillManifest;
  packageType: PackageType;
}

export const command: CommandDef = {
  name: "add",
  description: "Add a skill or persona",
  group: "manage",
  args: [{ name: "source", required: true }],
  options: [
    { flags: "-g, --global", description: "Install globally instead of project-local" },
    { flags: "-v, --version <version>", description: "Specific version to install" },
    { flags: "--github <token>", description: "GitHub personal access token for private repos" },
    { flags: "--skill <name>", description: "Skill name in repo (maps to skills/<name>/)" },
    { flags: "--author <author>", description: "Author name for converted skills (required for non-SPM format)" },
  ],
  handler: addCommand,
};

function parseSkillRef(ref: string): { author: string; name: string } | null {
  const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (!match) return null;
  return { author: match[1], name: match[2] };
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

function isRemoteSource(source: string): boolean {
  if (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(source)) return true;
  if (source.includes("github.com") || source.startsWith("github:")) return true;
  return false;
}

// owner/repo/path — 3+ segments, all alphanumeric/dash/dot/underscore
function isGitHubPath(source: string): boolean {
  return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/.+$/.test(source) && !source.startsWith(".");
}

export async function resolveSkillsDir(forceGlobal?: boolean): Promise<{ skillsDir: string; isProject: boolean }> {
  if (forceGlobal) {
    return { skillsDir: getGlobalSkillsDir(), isProject: false };
  }

  const cwd = process.cwd();
  const projectDir = getProjectSkillsDir(cwd);
  try {
    const stat = await fs.stat(projectDir);
    if (stat.isDirectory()) {
      return { skillsDir: projectDir, isProject: true };
    }
  } catch {
    // no project .spm/ — fall through to global
  }

  return { skillsDir: getGlobalSkillsDir(), isProject: false };
}

async function installFromLocal(
  skillPath: string,
  skillsDir: string,
): Promise<void> {
  const src = path.resolve(skillPath);

  let author: string;
  let name: string;
  let version: string;
  try {
    const parsed = await parseSkillFile(src);
    author = parsed.frontmatter.author;
    name = parsed.frontmatter.name;
    version = parsed.frontmatter.version;
  } catch {
    exitError(`Cannot read SKILL.md in "${skillPath}".`);
  }

  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, name);

  await fs.rm(dest, { recursive: true, force: true });
  await copyDir(src, dest);

  const index = await writeIndex(skillsDir);
  const lock = await writeLock(skillsDir);

  log.success(`Installed ${author}/${name}@${version}`);
  log.info(`${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}

export async function installSingleFromRegistry(
  author: string,
  skillName: string,
  skillsDir: string,
  client: RegistryClient,
  version?: string,
): Promise<InstallResult> {
  const s = spinner();
  s.start(`Fetching ${author}/${skillName}${version ? `@${version}` : ""}...`);

  const downloadResult = await client.getDownloadUrl(author, skillName, version);
  const manifest = downloadResult.manifest as unknown as SkillManifest;
  const packageType: PackageType = downloadResult.package_type === "persona" ? "persona" : "skill";

  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, manifest.name);

  await fs.rm(dest, { recursive: true, force: true });

  if (!downloadResult.download_url) {
    s.stop("Failed");
    exitError("Registry returned no download URL. The package may have been published without an archive.");
  }

  s.message("Downloading package...");
  const archiveRes = await fetch(downloadResult.download_url);
  if (!archiveRes.ok) {
    s.stop("Failed");
    exitError(`Failed to download package: ${archiveRes.status} ${archiveRes.statusText}`);
  }
  const archiveData = Buffer.from(await archiveRes.arrayBuffer());

  if (downloadResult.integrity) {
    const actual = computeIntegrity(archiveData);
    if (actual !== downloadResult.integrity) {
      s.stop("Failed");
      exitError(`Integrity mismatch.\n  Expected: ${downloadResult.integrity}\n  Got:      ${actual}`);
    }
  }

  const files = await unpackSkill(archiveData, dest);
  s.stop(`Unpacked ${files.length} file(s), ${(archiveData.length / 1024).toFixed(1)} KB`);

  return { manifest, packageType };
}

export async function installFromRegistry(
  ref: string,
  skillsDir: string,
  isProject: boolean,
  version?: string,
): Promise<void> {
  const parsed = parseSkillRef(ref);
  if (!parsed) {
    exitError(`Invalid package reference "${ref}". Expected author/name.`);
  }

  const config = await readConfig();
  const client = getClientForSkill(config, ref);

  if (!client) {
    exitError(`No registry configured for "${ref}".\nUse 'spm login <registry-url>' or 'spm registry add <url>' first.`);
  }

  const { manifest, packageType } = await installSingleFromRegistry(parsed.author, parsed.name, skillsDir, client, version);

  // Resolve and install dependencies (skills only — personas don't have transitive deps)
  if (packageType === "skill") {
    const deps = manifest.dependencies;
    if (deps && Object.keys(deps).length > 0) {
      const visited = new Set<string>([`${parsed.author}/${manifest.name}`]);
      const result = await resolveDependencies(deps, client, visited);

      for (const dep of result.resolved) {
        const depRef = parseSkillRef(dep.name);
        if (!depRef) continue;
        log.step(`Dependency: ${dep.name}@${dep.resolved} (${dep.range})`);
        const depClient = getClientForSkill(config, dep.name) ?? client;
        const { manifest: depManifest } = await installSingleFromRegistry(
          depRef.author,
          depRef.name,
          skillsDir,
          depClient,
          dep.resolved,
        );

        visited.add(dep.name);
        if (depManifest.dependencies && Object.keys(depManifest.dependencies).length > 0) {
          const nested = await resolveDependencies(depManifest.dependencies, depClient, visited);
          for (const nd of nested.resolved) {
            const ndRef = parseSkillRef(nd.name);
            if (!ndRef) continue;
            log.step(`Dependency: ${nd.name}@${nd.resolved} (${nd.range})`);
            const ndClient = getClientForSkill(config, nd.name) ?? client;
            visited.add(nd.name);
            await installSingleFromRegistry(ndRef.author, ndRef.name, skillsDir, ndClient, nd.resolved);
          }
          for (const m of nested.missing) {
            log.warning(`Dependency ${m.name} (${m.range}): ${m.reason}`);
          }
        }
      }

      for (const m of result.missing) {
        log.warning(`Dependency ${m.name} (${m.range}): ${m.reason}`);
      }
    }
  }

  if (isProject) {
    if (packageType === "persona") {
      await addPersonaDependency(process.cwd(), ref, manifest.version);
    } else {
      await addSkillDependency(process.cwd(), ref, manifest.version);
    }
  }

  const index = await writeIndex(skillsDir);
  const lock = await writeLock(skillsDir);

  const typeLabel = packageType === "persona" ? "persona" : "skill";
  log.success(`Installed ${typeLabel} ${parsed.author}/${manifest.name}@${manifest.version} from registry`);
  log.info(`${index.skills.length} package(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}

async function installFromGitHub(
  source: string,
  skillsDir: string,
  options: { github?: string; skill?: string; author?: string },
): Promise<void> {
  const ghSource = parseGitHubUrl(source);

  // --skill maps to skills/<name>/ path in the repo
  if (options.skill) {
    ghSource.path = ghSource.path
      ? `${ghSource.path}/skills/${options.skill}`
      : `skills/${options.skill}`;
  }

  const s = spinner();
  s.start(`Fetching from GitHub: ${ghSource.owner}/${ghSource.repo}${ghSource.path ? `/${ghSource.path}` : ""}...`);

  const config = await readConfig();
  const token = options.github ?? config.github?.token;

  let files: Map<string, string>;

  // Try skills/ prefix first (standard convention), then direct path
  if (ghSource.path && !ghSource.path.startsWith("skills/")) {
    const skillsPath = `skills/${ghSource.path}`;
    try {
      files = await downloadSkillFiles({ ...ghSource, path: skillsPath }, token);
      ghSource.path = skillsPath;
    } catch {
      // skills/ prefix didn't work — try direct path
      try {
        files = await downloadSkillFiles(ghSource, token);
      } catch (err) {
        s.stop("Failed");
        exitError(`Failed to fetch from GitHub: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    try {
      files = await downloadSkillFiles(ghSource, token);
    } catch (err) {
      s.stop("Failed");
      exitError(`Failed to fetch from GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const skillMdRaw = files.get("SKILL.md");
  if (!skillMdRaw) {
    s.stop("Failed");
    exitError("SKILL.md not found in GitHub source.");
  }

  // Detect format and convert if needed
  const { data, content: body } = matter(skillMdRaw);
  let author: string;
  let name: string;
  let version: string;
  let finalSkillMd = skillMdRaw;

  if (isVercelFormat(data)) {
    // Non-SPM format — auto-convert, default author to repo owner
    const effectiveAuthor = options.author ?? ghSource.owner.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    s.message("Converting to SPM format...");
    const converted = convertVercelToSpm(data as any, body, {
      author: effectiveAuthor,
      repository: `https://github.com/${ghSource.owner}/${ghSource.repo}`,
    });

    author = converted.frontmatter.author;
    name = converted.frontmatter.name;
    version = converted.frontmatter.version;
    finalSkillMd = serializeSkill(converted);

    log.info(`Auto-converted from Vercel format → SPM (${author}/${name}@${version})`);
  } else {
    // Already SPM format
    const { parseSkill } = await import("../../core/skill-parser.js");
    const parsed = parseSkill(skillMdRaw);
    author = parsed.frontmatter.author;
    name = parsed.frontmatter.name;
    version = parsed.frontmatter.version;
  }

  s.stop("Fetched");

  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, name);

  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });

  // Write SKILL.md (possibly converted)
  await fs.writeFile(path.join(dest, "SKILL.md"), finalSkillMd, "utf-8");

  // Write auxiliary files
  for (const [filePath, content] of files) {
    if (filePath === "SKILL.md") continue;
    const fullPath = path.join(dest, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  const index = await writeIndex(skillsDir);
  const lock = await writeLock(skillsDir);

  log.success(`Installed ${author}/${name}@${version} from GitHub`);
  log.info(`${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}

// --- Main command ---

export async function addCommand(
  source: string,
  options: { global?: boolean; version?: string; github?: string; skill?: string; author?: string },
): Promise<void> {
  const { skillsDir, isProject } = await resolveSkillsDir(options.global);

  // GitHub URL (explicit)
  if (source.includes("github.com") || source.startsWith("github:")) {
    await installFromGitHub(source, skillsDir, options);
    return;
  }

  // If --skill is used, treat source as GitHub owner/repo
  if (options.skill) {
    await installFromGitHub(source, skillsDir, options);
    return;
  }

  // owner/repo/path — e.g. vercel-labs/agent-skills/web-design-guidelines
  if (isGitHubPath(source)) {
    await installFromGitHub(source, skillsDir, options);
    return;
  }

  // Remote registry (author/name)
  if (isRemoteSource(source)) {
    await installFromRegistry(source, skillsDir, isProject, options.version);
    return;
  }

  // Local path
  await installFromLocal(source, skillsDir);
}

