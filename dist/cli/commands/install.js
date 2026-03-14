import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSkillsDir, getProjectSkillsDir, getInstalledDir } from "../../core/paths.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { readConfig } from "../../core/config.js";
import { getClientForSkill } from "../../core/registry-client.js";
import { downloadSkillFiles, parseGitHubUrl } from "../../core/github/client.js";
import { unpackSkill, computeIntegrity } from "../../core/storage/packager.js";
import { resolveDependencies } from "../../core/resolver.js";
import { readManifest, addDependency } from "../../core/manifest.js";
async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        }
        else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}
function isRemoteSource(source) {
    // author/name pattern
    if (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(source))
        return true;
    // GitHub URLs
    if (source.includes("github.com") || source.startsWith("github:"))
        return true;
    return false;
}
/** Parse "author/name" ref into parts. */
function parseSkillRef(ref) {
    const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
    if (!match)
        return null;
    return { author: match[1], name: match[2] };
}
/** Determine the skills directory: project-local if .skills/ exists, otherwise global. */
async function resolveSkillsDir(forceGlobal) {
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
    }
    catch {
        // no project .skills/ — fall through to global
    }
    return { skillsDir: getGlobalSkillsDir(), isProject: false };
}
async function installFromLocal(skillPath, skillsDir) {
    const src = path.resolve(skillPath);
    const manifestPath = path.join(src, "skill.json");
    let manifest;
    try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const data = JSON.parse(raw);
        const result = validateSkillManifest(data);
        if (!result.valid) {
            console.error("Invalid skill.json:");
            for (const error of result.errors) {
                console.error(`  - ${error}`);
            }
            process.exit(1);
        }
        manifest = data;
    }
    catch (err) {
        if (err instanceof Error && "code" in err) {
            console.error(`Error: cannot read skill.json in "${skillPath}".`);
        }
        else {
            throw err;
        }
        process.exit(1);
    }
    const author = manifest.author;
    const installedDir = getInstalledDir(skillsDir);
    const dest = path.join(installedDir, author, manifest.name);
    await fs.rm(dest, { recursive: true, force: true });
    await copyDir(src, dest);
    const index = await writeIndex(skillsDir);
    const lock = await writeLock(skillsDir);
    console.log(`Installed ${author}/${manifest.name}@${manifest.version}`);
    console.log(`  ${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}
async function installSingleFromRegistry(author, skillName, skillsDir, client, version) {
    console.log(`Fetching ${author}/${skillName}${version ? `@${version}` : ""} from registry...`);
    const downloadResult = await client.getDownloadUrl(author, skillName, version);
    const manifest = downloadResult.manifest;
    const installedDir = getInstalledDir(skillsDir);
    const dest = path.join(installedDir, author, manifest.name);
    await fs.rm(dest, { recursive: true, force: true });
    if (!downloadResult.download_url) {
        console.error("Error: registry returned no download URL. The skill may have been published without an archive.");
        process.exit(1);
    }
    console.log("Downloading package...");
    const archiveRes = await fetch(downloadResult.download_url);
    if (!archiveRes.ok) {
        throw new Error(`Failed to download package: ${archiveRes.status} ${archiveRes.statusText}`);
    }
    const archiveData = Buffer.from(await archiveRes.arrayBuffer());
    if (downloadResult.integrity) {
        const actual = computeIntegrity(archiveData);
        if (actual !== downloadResult.integrity) {
            console.error(`Error: integrity mismatch.`);
            console.error(`  Expected: ${downloadResult.integrity}`);
            console.error(`  Got:      ${actual}`);
            process.exit(1);
        }
    }
    const files = await unpackSkill(archiveData, dest);
    console.log(`  Unpacked ${files.length} file(s), ${(archiveData.length / 1024).toFixed(1)} KB`);
    return manifest;
}
async function installFromRegistry(skillRef, skillsDir, isProject, version) {
    const parsed = parseSkillRef(skillRef);
    if (!parsed) {
        console.error(`Error: invalid skill reference "${skillRef}". Expected author/name.`);
        process.exit(1);
    }
    const config = await readConfig();
    const client = getClientForSkill(config, skillRef);
    if (!client) {
        console.error(`Error: no registry configured for "${skillRef}".`);
        console.error("Use 'spm login <registry-url>' or 'spm registry add <url>' first.");
        process.exit(1);
    }
    const manifest = await installSingleFromRegistry(parsed.author, parsed.name, skillsDir, client, version);
    // Resolve and install dependencies
    const deps = manifest.dependencies;
    if (deps && Object.keys(deps).length > 0) {
        const visited = new Set([`${parsed.author}/${manifest.name}`]);
        const result = await resolveDependencies(deps, client, visited);
        for (const dep of result.resolved) {
            const depRef = parseSkillRef(dep.name);
            if (!depRef)
                continue;
            console.log(`  Dependency: ${dep.name}@${dep.resolved} (${dep.range})`);
            const depClient = getClientForSkill(config, dep.name) ?? client;
            const depManifest = await installSingleFromRegistry(depRef.author, depRef.name, skillsDir, depClient, dep.resolved);
            // Recursively resolve nested dependencies
            visited.add(dep.name);
            if (depManifest.dependencies && Object.keys(depManifest.dependencies).length > 0) {
                const nested = await resolveDependencies(depManifest.dependencies, depClient, visited);
                for (const nd of nested.resolved) {
                    const ndRef = parseSkillRef(nd.name);
                    if (!ndRef)
                        continue;
                    console.log(`  Dependency: ${nd.name}@${nd.resolved} (${nd.range})`);
                    const ndClient = getClientForSkill(config, nd.name) ?? client;
                    visited.add(nd.name);
                    await installSingleFromRegistry(ndRef.author, ndRef.name, skillsDir, ndClient, nd.resolved);
                }
                for (const m of nested.missing) {
                    console.warn(`  Warning: dependency ${m.name} (${m.range}): ${m.reason}`);
                }
            }
        }
        for (const m of result.missing) {
            console.warn(`  Warning: dependency ${m.name} (${m.range}): ${m.reason}`);
        }
    }
    // Add to skills.json when in project context
    if (isProject) {
        await addDependency(process.cwd(), skillRef, manifest.version);
    }
    const index = await writeIndex(skillsDir);
    const lock = await writeLock(skillsDir);
    console.log(`Installed ${parsed.author}/${manifest.name}@${manifest.version} from registry`);
    console.log(`  ${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}
async function installFromGitHub(source, skillsDir, githubToken) {
    const ghSource = parseGitHubUrl(source);
    console.log(`Fetching from GitHub: ${ghSource.owner}/${ghSource.repo}${ghSource.path ? `/${ghSource.path}` : ""}...`);
    const config = await readConfig();
    const token = githubToken ?? config.github?.token;
    const files = await downloadSkillFiles(ghSource, token);
    // Parse manifest from downloaded files
    const manifestRaw = files.get("skill.json");
    if (!manifestRaw) {
        console.error("Error: skill.json not found in GitHub source.");
        process.exit(1);
    }
    const manifest = JSON.parse(manifestRaw);
    const validation = validateSkillManifest(manifest);
    if (!validation.valid) {
        console.error("Invalid skill.json from GitHub:");
        for (const error of validation.errors) {
            console.error(`  - ${error}`);
        }
        process.exit(1);
    }
    const author = manifest.author;
    const installedDir = getInstalledDir(skillsDir);
    const dest = path.join(installedDir, author, manifest.name);
    await fs.rm(dest, { recursive: true, force: true });
    await fs.mkdir(dest, { recursive: true });
    // Write all files
    for (const [filePath, content] of files) {
        const fullPath = path.join(dest, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");
    }
    const index = await writeIndex(skillsDir);
    const lock = await writeLock(skillsDir);
    console.log(`Installed ${author}/${manifest.name}@${manifest.version} from GitHub`);
    console.log(`  ${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}
async function installAllFromManifest(skillsDir) {
    const cwd = process.cwd();
    const manifest = await readManifest(cwd);
    if (!manifest) {
        console.error("Error: no skill.json found. Run 'spm init --project' first.");
        process.exit(1);
    }
    const entries = Object.entries(manifest.dependencies);
    if (entries.length === 0) {
        console.log("No dependencies in skill.json.");
        return;
    }
    const config = await readConfig();
    console.log(`Installing ${entries.length} skill(s) from skill.json...`);
    for (const [skillRef] of entries) {
        const parsed = parseSkillRef(skillRef);
        if (!parsed) {
            console.warn(`  Skipping invalid ref: ${skillRef}`);
            continue;
        }
        const client = getClientForSkill(config, skillRef);
        if (!client) {
            console.warn(`  No registry for ${skillRef}, skipping.`);
            continue;
        }
        await installSingleFromRegistry(parsed.author, parsed.name, skillsDir, client);
    }
    const index = await writeIndex(skillsDir);
    const lock = await writeLock(skillsDir);
    console.log(`Done. ${index.skills.length} skill(s) indexed, ${lock.total_tokens_estimate} tokens total`);
}
export async function installCommand(source, options) {
    const { skillsDir, isProject } = await resolveSkillsDir(options.global);
    // No source — install all from skill.json
    if (!source) {
        await installAllFromManifest(skillsDir);
        return;
    }
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
//# sourceMappingURL=install.js.map