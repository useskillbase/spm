import { readConfig } from "../../core/config.js";
import { getSkillIndex } from "../../core/registry.js";
import { getStatsForSkill } from "../../core/feedback.js";
import { createRegistryClients } from "../../core/registry-client.js";
import { log, spinner } from "../ui.js";
export const command = {
    name: "search",
    description: "Search for skills locally and/or in remote registries",
    group: "registry",
    args: [{ name: "query", required: true }],
    options: [
        { flags: "--remote", description: "Search remote registries only" },
        { flags: "--all", description: "Search both local and remote" },
    ],
    handler: searchCommand,
};
export async function searchCommand(query, options) {
    const config = await readConfig();
    const showLocal = !options.remote;
    const showRemote = options.remote || options.all;
    // Local search
    if (showLocal) {
        const index = await getSkillIndex();
        const q = query.toLowerCase();
        const scored = index.skills.map((skill) => {
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
            return { skill, score };
        });
        const matches = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
        if (matches.length > 0) {
            log.info("Local results:");
            for (const m of matches) {
                const stats = await getStatsForSkill(m.skill.name);
                const conf = stats?.confidence != null ? ` (confidence: ${stats.confidence.toFixed(2)})` : "";
                log.message(`  ${m.skill.name}@${m.skill.v}  ${m.skill.trigger}${conf}`);
            }
        }
        else if (!showRemote) {
            log.info(`No local skills matching "${query}".`);
        }
    }
    // Remote search
    if (showRemote) {
        if (config.registries.length === 0) {
            log.info("No remote registries configured. Use 'skills login <url>' to add one.");
            return;
        }
        const clients = createRegistryClients(config);
        for (const [name, client] of clients) {
            const s = spinner();
            s.start(`Searching "${name}"...`);
            try {
                const result = await client.search(query);
                if (result.skills.length > 0) {
                    s.stop(`Registry "${name}" (${result.total} total)`);
                    for (const sk of result.skills) {
                        const rating = sk.avg_rating != null ? ` ${sk.avg_rating.toFixed(1)}★` : "";
                        log.message(`  ${sk.name}@${sk.version}  ${sk.trigger.description}  (${sk.installs} installs${rating})`);
                    }
                }
                else {
                    s.stop(`Registry "${name}": no results for "${query}".`);
                }
            }
            catch (err) {
                s.stop("Failed");
                const message = err instanceof Error ? err.message : String(err);
                log.error(`Registry "${name}" error: ${message}`);
            }
        }
    }
}
//# sourceMappingURL=search.js.map