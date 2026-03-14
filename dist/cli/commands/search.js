import { readConfig } from "../../core/config.js";
import { getSkillIndex } from "../../core/registry.js";
import { getStatsForSkill } from "../../core/feedback.js";
import { createRegistryClients } from "../../core/registry-client.js";
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
            console.log("Local results:");
            for (const m of matches) {
                const stats = await getStatsForSkill(m.skill.name);
                const conf = stats?.confidence != null ? ` (confidence: ${stats.confidence.toFixed(2)})` : "";
                console.log(`  ${m.skill.name}@${m.skill.v}  ${m.skill.trigger}${conf}`);
            }
        }
        else if (!showRemote) {
            console.log(`No local skills matching "${query}".`);
        }
        if (showRemote && matches.length > 0)
            console.log("");
    }
    // Remote search
    if (showRemote) {
        if (config.registries.length === 0) {
            console.log("No remote registries configured. Use 'skills login <url>' to add one.");
            return;
        }
        const clients = createRegistryClients(config);
        for (const [name, client] of clients) {
            try {
                const result = await client.search(query);
                if (result.skills.length > 0) {
                    console.log(`Registry "${name}" (${result.total} total):`);
                    for (const s of result.skills) {
                        const rating = s.avg_rating != null ? ` ${s.avg_rating.toFixed(1)}★` : "";
                        console.log(`  ${s.name}@${s.version}  ${s.trigger.description}  (${s.installs} installs${rating})`);
                    }
                }
                else {
                    console.log(`Registry "${name}": no results for "${query}".`);
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`Registry "${name}" error: ${message}`);
            }
        }
    }
}
//# sourceMappingURL=search.js.map