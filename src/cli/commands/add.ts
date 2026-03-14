import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../../core/config.js";
import { getClientForSkill, RegistryClient } from "../../core/registry-client.js";
import { validatePersonaManifest } from "../../schema/persona-schema.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { getGlobalSkillsDir, getProjectSkillsDir, getInstalledDir } from "../../core/paths.js";
import { downloadSkillFiles, parseGitHubUrl } from "../../core/github/client.js";
import { unpackSkill, computeIntegrity } from "../../core/storage/packager.js";
import { resolveDependencies } from "../../core/resolver.js";
import { addDependency, readManifest } from "../../core/manifest.js";
import type { SkillManifest, PersonaManifest } from "../../types/index.js";
import { log, spinner, multiselect, isCancel, cancel, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "add",
  description: "Add a skill",
  group: "manage",
  args: [{ name: "skill", required: true }],
  options: [
    { flags: "-g, --global", description: "Install globally instead of project-local" },
    { flags: "-v, --version <version>", description: "Specific version to install" },
    { flags: "--github <token>", description: "GitHub personal access token for private repos" },
    { flags: "--for [personas]", description: "Add skill reference to persona file(s) (comma-separated, no install)" },
  ],
  handler: addCommand,
};

// --- Persona ref mode ---

function parseSkillRef(ref: string): { author: string; name: string } | null {
  const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (!match) return null;
  return { author: match[1], name: match[2] };
}

async function findPersonaFiles(): Promise<string[]> {
  const cwd = process.cwd();
  const entries = await fs.readdir(cwd, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".person.json"))
    .map((e) => e.name);
}

async function findPersonaFile(name: string): Promise<string | null> {
  const fileName = `${name}.person.json`;
  const filePath = path.resolve(fileName);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

async function getLatestVersion(
  client: RegistryClient,
  author: string,
  name: string,
): Promise<string | null> {
  const versions = await client.getVersions(author, name);
  if (versions.length === 0) return null;
  return versions[versions.length - 1].version;
}

async function addRefToPersona(skillRef: string, personaName: string): Promise<void> {
  const filePath = await findPersonaFile(personaName);
  if (!filePath) {
    exitError(`"${personaName}.person.json" not found in current directory.`);
  }

  const raw = await fs.readFile(filePath, "utf-8");
  let persona: PersonaManifest;
  try {
    persona = JSON.parse(raw) as PersonaManifest;
  } catch {
    exitError(`Failed to parse "${path.basename(filePath)}".`);
  }

  const validation = validatePersonaManifest(persona);
  if (!validation.valid) {
    exitError(`Invalid persona manifest.\n${validation.errors.map((e) => `  ${e}`).join("\n")}`);
  }

  if (persona.skills && skillRef in persona.skills) {
    log.info(`Skill "${skillRef}" already in persona "${personaName}".`);
    return;
  }

  const parsed = parseSkillRef(skillRef);
  const config = await readConfig();
  let versionRange = "*";

  if (parsed) {
    const client = getClientForSkill(config, skillRef);
    if (client) {
      try {
        const latest = await getLatestVersion(client, parsed.author, parsed.name);
        if (latest) {
          versionRange = `^${latest}`;
          log.info(`Found ${skillRef}@${latest} in registry.`);
        }
      } catch {
        log.warning(`Could not query registry. Adding with "*".`);
      }
    }
  }

  if (!persona.skills) persona.skills = {};
  persona.skills[skillRef] = versionRange;

  await fs.writeFile(filePath, JSON.stringify(persona, null, 2) + "\n", "utf-8");
  log.success(`Added "${skillRef}": "${versionRange}" to ${path.basename(filePath)}.`);
}

async function addToPersonas(skillRef: string, personasArg?: string): Promise<void> {
  if (personasArg) {
    const names = personasArg.split(",").map((n) => n.trim());
    for (const name of names) {
      await addRefToPersona(skillRef, name);
    }
    return;
  }

  // Interactive: find .person.json files in cwd
  const files = await findPersonaFiles();
  if (files.length === 0) {
    exitError("No .person.json files found in current directory. Specify --for <persona>.");
  }

  if (files.length === 1) {
    const name = files[0].replace(".person.json", "");
    await addRefToPersona(skillRef, name);
    return;
  }

  const choices = await multiselect({
    message: "Add to which persona(s)?",
    options: files.map((f) => ({
      value: f.replace(".person.json", ""),
      label: f,
    })),
    required: true,
  });

  if (isCancel(choices)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  for (const name of choices as string[]) {
    await addRefToPersona(skillRef, name);
  }
}

// --- Install mode (from old install.ts) ---

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

async function resolveSkillsDir(forceGlobal?: boolean): Promise<{ skillsDir: string; isProject: boolean }> {
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
    // no project .skills/ — fall through to global
  }

  return { skillsDir: getGlobalSkillsDir(), isProject: false };
}

async function installFromLocal(
  skillPath: string,
  skillsDir: string,
): Promise<void> {
  const src = path.resolve(skillPath);
  const manifestPath = path.join(src, "skill.json");

  let manifest: SkillManifest;
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    const result = validateSkillManifest(data);
    if (!result.valid) {
      exitError(`Invalid skill.json:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`);
    }
    manifest = data as SkillManifest;
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      exitError(`Cannot read skill.json in "${skillPath}".`);
    } else {
      throw err;
    }
  }

  const author = manifest.author;
  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, manifest.name);

  await fs.rm(dest, { recursive: true, force: true });
  await copyDir(src, dest);

  const index = await writeIndex(skillsDir);
  const lock = await writeLock(skillsDir);

  log.success(`Installed ${author}/${manifest.name}@${manifest.version}`);
  log.info(`${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}

async function installSingleFromRegistry(
  author: string,
  skillName: string,
  skillsDir: string,
  client: RegistryClient,
  version?: string,
): Promise<SkillManifest> {
  const s = spinner();
  s.start(`Fetching ${author}/${skillName}${version ? `@${version}` : ""}...`);

  const downloadResult = await client.getDownloadUrl(author, skillName, version);
  const manifest = downloadResult.manifest as unknown as SkillManifest;

  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, manifest.name);

  await fs.rm(dest, { recursive: true, force: true });

  if (!downloadResult.download_url) {
    s.stop("Failed");
    exitError("Registry returned no download URL. The skill may have been published without an archive.");
  }

  s.message("Downloading package...");
  const archiveRes = await fetch(downloadResult.download_url);
  if (!archiveRes.ok) {
    s.stop("Failed");
    throw new Error(`Failed to download package: ${archiveRes.status} ${archiveRes.statusText}`);
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

  return manifest;
}

async function installFromRegistry(
  skillRef: string,
  skillsDir: string,
  isProject: boolean,
  version?: string,
): Promise<void> {
  const parsed = parseSkillRef(skillRef);
  if (!parsed) {
    exitError(`Invalid skill reference "${skillRef}". Expected author/name.`);
  }

  const config = await readConfig();
  const client = getClientForSkill(config, skillRef);

  if (!client) {
    exitError(`No registry configured for "${skillRef}".\nUse 'spm login <registry-url>' or 'spm registry add <url>' first.`);
  }

  const manifest = await installSingleFromRegistry(parsed.author, parsed.name, skillsDir, client, version);

  // Resolve and install dependencies
  const deps = manifest.dependencies;
  if (deps && Object.keys(deps).length > 0) {
    const visited = new Set<string>([`${parsed.author}/${manifest.name}`]);
    const result = await resolveDependencies(deps, client, visited);

    for (const dep of result.resolved) {
      const depRef = parseSkillRef(dep.name);
      if (!depRef) continue;
      log.step(`Dependency: ${dep.name}@${dep.resolved} (${dep.range})`);
      const depClient = getClientForSkill(config, dep.name) ?? client;
      const depManifest = await installSingleFromRegistry(
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

  if (isProject) {
    await addDependency(process.cwd(), skillRef, manifest.version);
  }

  const index = await writeIndex(skillsDir);
  const lock = await writeLock(skillsDir);

  log.success(`Installed ${parsed.author}/${manifest.name}@${manifest.version} from registry`);
  log.info(`${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}

async function installFromGitHub(
  source: string,
  skillsDir: string,
  githubToken?: string,
): Promise<void> {
  const ghSource = parseGitHubUrl(source);
  const s = spinner();
  s.start(`Fetching from GitHub: ${ghSource.owner}/${ghSource.repo}${ghSource.path ? `/${ghSource.path}` : ""}...`);

  const config = await readConfig();
  const token = githubToken ?? config.github?.token;

  const files = await downloadSkillFiles(ghSource, token);

  const manifestRaw = files.get("skill.json");
  if (!manifestRaw) {
    s.stop("Failed");
    exitError("skill.json not found in GitHub source.");
  }

  const manifest = JSON.parse(manifestRaw) as SkillManifest;
  const validation = validateSkillManifest(manifest as unknown);
  if (!validation.valid) {
    s.stop("Failed");
    exitError(`Invalid skill.json from GitHub:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  s.stop("Fetched");

  const author = manifest.author;
  const installedDir = getInstalledDir(skillsDir);
  const dest = path.join(installedDir, author, manifest.name);

  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });

  for (const [filePath, content] of files) {
    const fullPath = path.join(dest, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  }

  const index = await writeIndex(skillsDir);
  const lock = await writeLock(skillsDir);

  log.success(`Installed ${author}/${manifest.name}@${manifest.version} from GitHub`);
  log.info(`${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}

// --- Main command ---

export async function addCommand(
  source: string,
  options: { global?: boolean; version?: string; github?: string; for?: string | boolean },
): Promise<void> {
  // --for mode: add ref to persona file(s), no install
  if (options.for !== undefined) {
    const personasArg = typeof options.for === "string" ? options.for : undefined;
    await addToPersonas(source, personasArg);
    return;
  }

  const { skillsDir, isProject } = await resolveSkillsDir(options.global);

  // GitHub URL
  if (source.includes("github.com") || source.startsWith("github:")) {
    await installFromGitHub(source, skillsDir, options.github);
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

// Re-export for use by persona activate
export { installSingleFromRegistry, resolveSkillsDir };
