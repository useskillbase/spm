import { readConfig } from "../../core/config.js";
import { getClientForSkill } from "../../core/registry-client.js";
import { readWorkspaceManifest } from "../../core/manifest.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
import { log, exitError } from "../ui.js";
import { installSingleFromRegistry, resolveSkillsDir } from "./add.js";
export const command = {
    name: "install",
    description: "Install all dependencies from skillbase.json",
    group: "manage",
    aliases: ["i"],
    options: [
        { flags: "-g, --global", description: "Install to global skills directory" },
    ],
    handler: installAllCommand,
};
function parseSkillRef(ref) {
    const match = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
    if (!match)
        return null;
    return { author: match[1], name: match[2] };
}
async function installRefs(refs, skillsDir, label) {
    if (refs.length === 0)
        return;
    const config = await readConfig();
    log.step(`Installing ${refs.length} ${label}(s) from skillbase.json...`);
    for (const [ref] of refs) {
        const parsed = parseSkillRef(ref);
        if (!parsed) {
            log.warning(`Skipping invalid ref: ${ref}`);
            continue;
        }
        const client = getClientForSkill(config, ref);
        if (!client) {
            log.warning(`No registry for ${ref}, skipping.`);
            continue;
        }
        await installSingleFromRegistry(parsed.author, parsed.name, skillsDir, client);
    }
}
export async function installAllCommand(options) {
    const { skillsDir } = await resolveSkillsDir(options.global);
    const cwd = process.cwd();
    const manifest = await readWorkspaceManifest(cwd);
    if (!manifest) {
        exitError("No skillbase.json found. Run 'spm init --project' first.");
    }
    const skillEntries = Object.entries(manifest.skills ?? {});
    const personaEntries = Object.entries(manifest.personas ?? {});
    if (skillEntries.length === 0 && personaEntries.length === 0) {
        log.info("No dependencies in skillbase.json.");
        return;
    }
    await installRefs(skillEntries, skillsDir, "skill");
    await installRefs(personaEntries, skillsDir, "persona");
    const index = await writeIndex(skillsDir);
    const lock = await writeLock(skillsDir);
    log.success(`Done. ${index.skills.length} package(s) indexed, ${lock.total_tokens_estimate} tokens total`);
    // Auto-start status server (non-fatal)
    try {
        const { ensureStatusServer } = await import("../../core/status-server.js");
        await ensureStatusServer();
    }
    catch {
        // Status server is optional
    }
}
//# sourceMappingURL=install.js.map