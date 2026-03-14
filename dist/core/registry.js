import fs from "node:fs/promises";
import { getGlobalSkillsDir, getProjectSkillsDir, getIndexPath } from "./paths.js";
async function readIndex(skillsDir) {
    const indexPath = getIndexPath(skillsDir);
    try {
        const raw = await fs.readFile(indexPath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Reads and merges skill indexes from project-level and global directories.
 * Project skills override global ones by name.
 */
export async function getSkillIndex(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const globalDir = getGlobalSkillsDir();
    const projectDir = getProjectSkillsDir(cwd);
    const [globalIndex, projectIndex] = await Promise.all([
        readIndex(globalDir),
        readIndex(projectDir),
    ]);
    const skillMap = new Map();
    // Global first — project overrides
    if (globalIndex) {
        for (const skill of globalIndex.skills) {
            skillMap.set(skill.name, skill);
        }
    }
    if (projectIndex) {
        for (const skill of projectIndex.skills) {
            skillMap.set(skill.name, skill);
        }
    }
    const skills = Array.from(skillMap.values());
    skills.sort((a, b) => b.priority - a.priority);
    return { version: "1.0.0", skills };
}
export function findSkill(index, name) {
    return index.skills.find((s) => s.name === name);
}
//# sourceMappingURL=registry.js.map