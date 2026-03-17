import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../../core/config.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { RegistryClient } from "../../core/registry-client.js";
import { packSkill } from "../../core/storage/index.js";
import { parseGitHubUrl } from "../../core/github/client.js";
import { log, spinner, note, exitError, formatSize } from "../ui.js";
const BATCH_LIMIT = 1000;
export const command = {
    name: "publish",
    description: "Publish a skill to registry",
    group: "registry",
    args: [{ name: "source", required: false }],
    options: [
        { flags: "--registry <name>", description: "Publish to a specific registry" },
        { flags: "--github", description: "Source is a GitHub URL" },
        { flags: "--dry-run", description: "Show what would happen without executing" },
        { flags: "--all", description: "Publish all skills found in subdirectories (max 1000)" },
    ],
    handler: publishCommand,
};
export async function publishCommand(source, options) {
    if (options.all) {
        await publishAll(options);
        return;
    }
    if (!source) {
        exitError("Provide a source path or use --all to publish all skills in subdirectories.");
    }
    const { client, reg } = await resolveRegistry(options.registry);
    const isGitHub = options.github || source.includes("github.com") || source.startsWith("github:");
    if (isGitHub) {
        const s = spinner();
        s.start(`Publishing from GitHub: ${source}`);
        const ghSource = parseGitHubUrl(source);
        const result = await client.publish({
            manifest: {},
            content: "",
            source: {
                type: "github",
                url: source,
                ref: ghSource.ref,
                path: ghSource.path,
            },
        });
        s.stop(result.updated
            ? `Updated ${result.name}@${result.version}`
            : `Published ${result.name}@${result.version}`);
        return;
    }
    await publishOne(source, client, reg, options.dryRun);
}
async function resolveRegistry(registryName) {
    const config = await readConfig();
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
    return { client: new RegistryClient(reg.url, reg.token), reg };
}
async function publishOne(source, client, reg, dryRun) {
    const skillDir = path.resolve(source);
    const manifestPath = path.join(skillDir, "skill.json");
    let manifest;
    try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const data = JSON.parse(raw);
        const validation = validateSkillManifest(data);
        if (!validation.valid) {
            throw new Error(`Invalid skill.json:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
        }
        manifest = data;
    }
    catch (err) {
        if (err.code === "ENOENT") {
            throw new Error(`Cannot read skill.json in "${source}".`);
        }
        throw err;
    }
    if (!manifest.entry) {
        throw new Error(`${manifest.name}: no 'entry' field. Bundles cannot be published.`);
    }
    const entryPath = path.join(skillDir, manifest.entry);
    const content = await fs.readFile(entryPath, "utf-8");
    let compactContent;
    if (manifest.compact_entry) {
        try {
            compactContent = await fs.readFile(path.join(skillDir, manifest.compact_entry), "utf-8");
        }
        catch {
            // Optional
        }
    }
    const s = spinner();
    s.start(`Packaging ${manifest.name}@${manifest.version}...`);
    const pkg = await packSkill(skillDir);
    if (dryRun) {
        s.stop("Done (dry-run)");
        note(`Would publish ${manifest.name}@${manifest.version} to ${reg.name}\nPackage size: ${formatSize(pkg.size)} (${pkg.filesCount} files)\nIntegrity: ${pkg.integrity}`, "Dry run");
        return { name: manifest.name, version: manifest.version, updated: false };
    }
    s.message(`Publishing ${manifest.name}@${manifest.version} to ${reg.name}...`);
    const result = await client.publishWithArchive({ manifest, content, compact_content: compactContent }, pkg.data);
    s.stop(result.updated
        ? `Updated ${result.name}@${result.version}`
        : `Published ${result.name}@${result.version}`);
    log.info(`Size: ${formatSize(result.size ?? pkg.size)}`);
    log.info(`Tokens: ~${Math.ceil(content.length / 4).toLocaleString()}`);
    return { name: result.name, version: result.version, updated: result.updated };
}
async function discoverSkillDirs(baseDir) {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const dirs = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (entry.name.startsWith(".") || entry.name === "node_modules")
            continue;
        const skillJson = path.join(baseDir, entry.name, "skill.json");
        try {
            await fs.access(skillJson);
            dirs.push(path.join(baseDir, entry.name));
        }
        catch {
            // No skill.json — skip
        }
    }
    return dirs.sort();
}
async function publishAll(options) {
    const baseDir = process.cwd();
    const skillDirs = await discoverSkillDirs(baseDir);
    if (skillDirs.length === 0) {
        exitError(`No subdirectories with skill.json found in ${baseDir}`);
    }
    if (skillDirs.length > BATCH_LIMIT) {
        exitError(`Found ${skillDirs.length} skills — exceeds limit of ${BATCH_LIMIT}. Publish in smaller batches.`);
    }
    log.info(`Found ${skillDirs.length} skills to publish`);
    const { client, reg } = await resolveRegistry(options.registry);
    let published = 0;
    let updated = 0;
    let failed = 0;
    for (const dir of skillDirs) {
        try {
            const result = await publishOne(dir, client, reg, options.dryRun);
            if (result.updated) {
                updated++;
            }
            else {
                published++;
            }
        }
        catch (err) {
            failed++;
            log.error(`Failed: ${path.basename(dir)} — ${err.message}`);
        }
    }
    const parts = [];
    if (published > 0)
        parts.push(`${published} published`);
    if (updated > 0)
        parts.push(`${updated} updated`);
    if (failed > 0)
        parts.push(`${failed} failed`);
    log.success(`Done: ${parts.join(", ")}`);
}
//# sourceMappingURL=publish.js.map