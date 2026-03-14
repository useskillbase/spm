import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../../core/config.js";
import { validateSkillManifest } from "../../schema/skill-schema.js";
import { RegistryClient } from "../../core/registry-client.js";
import { packSkill } from "../../core/storage/index.js";
import { parseGitHubUrl } from "../../core/github/client.js";
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export async function publishCommand(source, options) {
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
    const isGitHub = options.github || source.includes("github.com") || source.startsWith("github:");
    if (isGitHub) {
        console.log(`Publishing from GitHub: ${source}`);
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
        console.log(result.updated
            ? `Updated ${result.name}@${result.version}`
            : `Published ${result.name}@${result.version}`);
        return;
    }
    const skillDir = path.resolve(source);
    const manifestPath = path.join(skillDir, "skill.json");
    let manifest;
    try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const data = JSON.parse(raw);
        const validation = validateSkillManifest(data);
        if (!validation.valid) {
            console.error("Invalid skill.json:");
            for (const error of validation.errors) {
                console.error(`  - ${error}`);
            }
            process.exit(1);
        }
        manifest = data;
    }
    catch (err) {
        if (err.code === "ENOENT") {
            console.error(`Error: cannot read skill.json in "${source}".`);
            process.exit(1);
        }
        throw err;
    }
    if (!manifest.entry) {
        console.error("Error: skill.json has no 'entry' field. Bundles cannot be published — only skills with an entry point.");
        process.exit(1);
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
    // Package skill directory into .tar.gz
    console.log(`Packaging ${manifest.name}@${manifest.version}...`);
    const pkg = await packSkill(skillDir);
    if (options.dryRun) {
        console.log(`[dry-run] Would publish ${manifest.name}@${manifest.version} to ${reg.name}`);
        console.log(`  Package size: ${formatSize(pkg.size)} (${pkg.filesCount} files)`);
        console.log(`  Integrity: ${pkg.integrity}`);
        return;
    }
    console.log(`Publishing ${manifest.name}@${manifest.version} to ${reg.name}...`);
    const result = await client.publishWithArchive({ manifest, content, compact_content: compactContent }, pkg.data);
    console.log(result.updated
        ? `Updated ${result.name}@${result.version}`
        : `Published ${result.name}@${result.version}`);
    console.log(`  Size: ${formatSize(result.size ?? pkg.size)}`);
    console.log(`  Tokens: ~${Math.ceil(content.length / 4).toLocaleString()}`);
}
//# sourceMappingURL=publish.js.map