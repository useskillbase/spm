import { readConfig } from "../../core/config.js";
import { getSkillIndex } from "../../core/registry.js";
import { createRegistryClients } from "../../core/registry-client.js";
import { addCommand } from "./add.js";
import { uninstallCommand } from "./uninstall.js";
import { log, spinner, multiselect, isCancel, cancel } from "../ui.js";
export const command = {
    name: "search",
    description: "Search for skills locally and/or in remote registries",
    group: "registry",
    args: [{ name: "query", required: true }],
    options: [
        { flags: "--local", description: "Search local skills only" },
        { flags: "--remote", description: "Search remote registries only" },
    ],
    handler: searchCommand,
};
export async function searchCommand(query, options) {
    const config = await readConfig();
    const showRemote = !options.local;
    const index = await getSkillIndex();
    const installedNames = new Set(index.skills.map((s) => s.name));
    const skillMap = new Map();
    // Local matches
    const q = query.toLowerCase();
    for (const skill of index.skills) {
        let score = 0;
        if (skill.name.toLowerCase().includes(q))
            score += 10;
        if (skill.tags.some((t) => t === q))
            score += 8;
        if (skill.tags.some((t) => t.includes(q)))
            score += 4;
        if (skill.trigger.toLowerCase().includes(q))
            score += 3;
        if (skill.file_patterns?.some((p) => p.includes(q)))
            score += 6;
        if (score > 0) {
            skillMap.set(skill.name, {
                ref: skill.name,
                version: skill.v,
                installed: true,
            });
        }
    }
    // Remote search
    if (showRemote) {
        if (config.registries.length === 0 && skillMap.size === 0) {
            log.info("No remote registries configured. Use 'spm login <url>' to add one.");
            return;
        }
        const clients = createRegistryClients(config);
        for (const [name, client] of clients) {
            const s = spinner();
            s.start(`Searching "${name}"...`);
            try {
                const result = await client.search(query);
                s.stop(`Registry "${name}" (${result.total} total)`);
                // Sort by popularity
                const sorted = [...result.skills].sort((a, b) => b.installs - a.installs);
                for (const sk of sorted) {
                    const fullRef = `${sk.author}/${sk.name}`;
                    const existing = skillMap.get(fullRef);
                    skillMap.set(fullRef, {
                        ref: fullRef,
                        version: existing?.version ?? sk.version,
                        installed: installedNames.has(fullRef),
                        installs: sk.installs,
                        rating: sk.avg_rating,
                    });
                }
            }
            catch (err) {
                s.stop("Failed");
                const message = err instanceof Error ? err.message : String(err);
                log.error(`Registry "${name}" error: ${message}`);
            }
        }
    }
    const skills = Array.from(skillMap.values());
    if (skills.length === 0) {
        log.info(`No skills matching "${query}".`);
        return;
    }
    // Sort: installed first, then by installs
    skills.sort((a, b) => {
        if (a.installed !== b.installed)
            return a.installed ? -1 : 1;
        return (b.installs ?? 0) - (a.installs ?? 0);
    });
    const initialValues = skills.filter((s) => s.installed).map((s) => s.ref);
    const choices = await multiselect({
        message: "Manage skills (checked = installed):",
        options: skills.map((s) => {
            const parts = [];
            if (s.installs != null)
                parts.push(`${s.installs} installs`);
            if (s.rating != null)
                parts.push(`${s.rating.toFixed(1)}★`);
            return {
                value: s.ref,
                label: `${s.ref}@${s.version}`,
                hint: parts.length > 0 ? parts.join(", ") : undefined,
            };
        }),
        initialValues,
        required: false,
    });
    if (isCancel(choices)) {
        cancel("Cancelled.");
        return;
    }
    const selected = new Set(choices);
    const toInstall = skills.filter((s) => !s.installed && selected.has(s.ref));
    const toRemove = skills.filter((s) => s.installed && !selected.has(s.ref));
    if (toInstall.length === 0 && toRemove.length === 0)
        return;
    for (const skill of toInstall) {
        try {
            await addCommand(skill.ref, {});
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to install "${skill.ref}": ${message}`);
        }
    }
    for (const skill of toRemove) {
        try {
            await uninstallCommand(skill.ref);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log.error(`Failed to uninstall "${skill.ref}": ${message}`);
        }
    }
}
//# sourceMappingURL=search.js.map