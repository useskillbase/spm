import fs from "node:fs/promises";
import path from "node:path";
import { runLoadHooks } from "./plugins/index.js";
export async function loadSkill(entry, compact = false) {
    const entryPath = compact && entry.compact_entry ? entry.compact_entry : entry.entry;
    const raw = await fs.readFile(entryPath, "utf-8");
    // Read skill.json for extra metadata
    const skillDir = path.dirname(entryPath);
    const manifestPath = path.join(skillDir, "skill.json");
    let permissions = [];
    let worksWithList = undefined;
    try {
        const manifestRaw = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(manifestRaw);
        permissions = manifest.security?.permissions ?? [];
        worksWithList = manifest.works_with;
    }
    catch {
        // Metadata unavailable — continue with defaults
    }
    // Run load plugins (e.g. spotlighting)
    const content = await runLoadHooks({
        content: raw,
        name: entry.name,
        version: entry.v,
        permissions,
    });
    return {
        name: entry.name,
        version: entry.v,
        content,
        permissions,
        tokens_estimate: entry.tokens_estimate,
        works_with: worksWithList,
    };
}
//# sourceMappingURL=loader.js.map