#!/usr/bin/env node
import fs from "node:fs/promises";
import { writeIndex } from "../core/indexer.js";
import { getGlobalSkillsDir, getProjectSkillsDir, getInstalledDir } from "../core/paths.js";
async function dirExists(dir) {
    try {
        const stat = await fs.stat(dir);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
async function main() {
    const args = process.argv.slice(2);
    const target = args[0] ?? "global";
    if (target === "global" || target === "all") {
        const dir = getGlobalSkillsDir();
        const index = await writeIndex(dir);
        console.log(`Global index: ${index.skills.length} skill(s) → ${dir}/index.json`);
    }
    if (target === "project" || target === "all") {
        const dir = getProjectSkillsDir(process.cwd());
        if (await dirExists(getInstalledDir(dir))) {
            const index = await writeIndex(dir);
            console.log(`Project index: ${index.skills.length} skill(s) → ${dir}/index.json`);
        }
        else if (target === "project") {
            console.log("No .skills/installed/ directory found in current project.");
        }
    }
}
main().catch((err) => {
    console.error("Reindex failed:", err);
    process.exit(1);
});
//# sourceMappingURL=reindex.js.map