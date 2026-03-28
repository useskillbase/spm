import fs from "node:fs/promises";
import path from "node:path";
import { readConfig } from "../../core/config.js";
import { parseSkill } from "../../core/skill-parser.js";
import { parseSoul } from "../../core/persona-parser.js";
import { validateSkillFrontmatter } from "../../schema/skill-schema.js";
import { validateSoulFrontmatter } from "../../schema/persona-schema.js";
import { RegistryClient } from "../../core/registry-client.js";
import { packSkill } from "../../core/storage/index.js";
import { parseGitHubUrl } from "../../core/github/client.js";
import { log, spinner, note, exitError, formatSize } from "../ui.js";
const BATCH_LIMIT = 1000;
export const command = {
    name: "publish",
    description: "Publish a skill or persona to registry",
    group: "registry",
    args: [{ name: "source", required: false }],
    options: [
        { flags: "--registry <name>", description: "Publish to a specific registry" },
        { flags: "--github", description: "Source is a GitHub URL" },
        { flags: "--dry-run", description: "Show what would happen without executing" },
        { flags: "--all", description: "Publish all packages found in subdirectories (max 1000)" },
        { flags: "--private", description: "Publish as a private package (requires Pro plan)" },
    ],
    handler: publishCommand,
};
export async function publishCommand(source, options) {
    const visibility = options.private ? "private" : undefined;
    if (options.all) {
        await publishAll(options, visibility);
        return;
    }
    if (!source) {
        exitError("Provide a source path or use --all to publish all packages in subdirectories.");
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
            visibility,
        });
        s.stop(result.updated
            ? `Updated ${result.name}@${result.version}`
            : `Published ${result.name}@${result.version}`);
        return;
    }
    try {
        await publishOne(source, client, reg, options.dryRun, visibility);
    }
    catch (err) {
        exitError(err instanceof Error ? err.message : String(err));
    }
}
async function resolveRegistry(registryName) {
    const config = await readConfig();
    if (!registryName) {
        registryName = config.scopes["*"];
    }
    if (!registryName) {
        exitError("No default registry configured. Use 'spm login <url>' first.");
    }
    const reg = config.registries.find((r) => r.name === registryName);
    if (!reg) {
        exitError(`Registry "${registryName}" not found in config.`);
    }
    if (!reg.token) {
        exitError(`No token for registry "${registryName}". Use 'spm login' first.`);
    }
    return { client: new RegistryClient(reg.url, reg.token), reg };
}
async function detectEntryFile(dir) {
    const soulPath = path.join(dir, "SOUL.md");
    try {
        await fs.access(soulPath);
        return { filename: "SOUL.md", isPersona: true };
    }
    catch { /* not found */ }
    const skillPath = path.join(dir, "SKILL.md");
    try {
        await fs.access(skillPath);
        return { filename: "SKILL.md", isPersona: false };
    }
    catch { /* not found */ }
    throw new Error(`No SKILL.md or SOUL.md found in "${dir}".`);
}
async function publishOne(source, client, reg, dryRun, visibility) {
    const pkgDir = path.resolve(source);
    const { filename, isPersona } = await detectEntryFile(pkgDir);
    const raw = await fs.readFile(path.join(pkgDir, filename), "utf-8");
    let manifest;
    let body;
    if (isPersona) {
        const parsed = parseSoul(raw);
        const validation = validateSoulFrontmatter(parsed.frontmatter);
        if (!validation.valid) {
            throw new Error(`Invalid SOUL.md:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
        }
        const fm = parsed.frontmatter;
        // Validate skill dependencies exist in registry
        const depSkills = fm.skillbase?.skills ?? {};
        const depRefs = Object.keys(depSkills);
        if (depRefs.length > 0) {
            const missing = [];
            for (const ref of depRefs) {
                const slashIdx = ref.indexOf("/");
                if (slashIdx === -1) {
                    missing.push(`${ref} (invalid format, expected author/name)`);
                    continue;
                }
                const depAuthor = ref.slice(0, slashIdx);
                const depName = ref.slice(slashIdx + 1);
                try {
                    const skill = await client.getSkill(depAuthor, depName);
                    if (!skill)
                        missing.push(ref);
                }
                catch {
                    missing.push(ref);
                }
            }
            if (missing.length > 0) {
                throw new Error(`Persona depends on skills not found in registry:\n${missing.map((s) => `  - ${s}`).join("\n")}`);
            }
        }
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
        };
        body = parsed.body;
    }
    else {
        const parsed = parseSkill(raw);
        const validation = validateSkillFrontmatter(parsed.frontmatter);
        if (!validation.valid) {
            throw new Error(`Invalid SKILL.md:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`);
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
        body = parsed.body;
    }
    const typeLabel = isPersona ? "persona" : "skill";
    const s = spinner();
    s.start(`Packaging ${typeLabel} ${manifest.name}@${manifest.version}...`);
    const pkg = await packSkill(pkgDir);
    if (dryRun) {
        s.stop("Done (dry-run)");
        const visLabel = visibility === "private" ? "\nVisibility: private" : "";
        note(`Would publish ${typeLabel} ${manifest.name}@${manifest.version} to ${reg.name}\nPackage size: ${formatSize(pkg.size)} (${pkg.filesCount} files)\nIntegrity: ${pkg.integrity}${visLabel}`, "Dry run");
        return { name: manifest.name, version: manifest.version, updated: false };
    }
    s.message(`Publishing ${typeLabel} ${manifest.name}@${manifest.version} to ${reg.name}...`);
    let result;
    try {
        result = await client.publishWithArchive({ manifest, content: raw, filename, visibility }, pkg.data);
    }
    catch (err) {
        s.stop("Failed");
        exitError(err instanceof Error ? err.message : String(err));
    }
    s.stop(result.updated
        ? `Updated ${typeLabel} ${result.name}@${result.version}`
        : `Published ${typeLabel} ${result.name}@${result.version}`);
    log.info(`Size: ${formatSize(result.size ?? pkg.size)}`);
    log.info(`Tokens: ~${Math.ceil(body.length / 4).toLocaleString()}`);
    return { name: result.name, version: result.version, updated: result.updated };
}
async function discoverPackageDirs(baseDir) {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const dirs = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        if (entry.name.startsWith(".") || entry.name === "node_modules")
            continue;
        const dirPath = path.join(baseDir, entry.name);
        // Check for SKILL.md or SOUL.md
        for (const filename of ["SKILL.md", "SOUL.md"]) {
            try {
                await fs.access(path.join(dirPath, filename));
                dirs.push(dirPath);
                break;
            }
            catch { /* not found */ }
        }
    }
    return dirs.sort();
}
async function publishAll(options, visibility) {
    const baseDir = process.cwd();
    const pkgDirs = await discoverPackageDirs(baseDir);
    if (pkgDirs.length === 0) {
        exitError(`No subdirectories with SKILL.md or SOUL.md found in ${baseDir}`);
    }
    if (pkgDirs.length > BATCH_LIMIT) {
        exitError(`Found ${pkgDirs.length} packages — exceeds limit of ${BATCH_LIMIT}. Publish in smaller batches.`);
    }
    log.info(`Found ${pkgDirs.length} package(s) to publish`);
    const { client, reg } = await resolveRegistry(options.registry);
    let published = 0;
    let updated = 0;
    let failed = 0;
    for (const dir of pkgDirs) {
        try {
            const result = await publishOne(dir, client, reg, options.dryRun, visibility);
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