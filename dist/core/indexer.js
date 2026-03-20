import fs from "node:fs/promises";
import path from "node:path";
import { getInstalledDir, getIndexPath, getGlobalSkillsDir } from "./paths.js";
import { parseSkill } from "./skill-parser.js";
import { parseSoul } from "./persona-parser.js";
function estimateTokens(content) {
    return Math.ceil(content.length / 4);
}
async function readSkillEntry(skillDir, author, skillName) {
    const skillMdPath = path.join(skillDir, "SKILL.md");
    try {
        await fs.access(skillMdPath);
    }
    catch {
        return null;
    }
    try {
        const parsed = parseSkill(await fs.readFile(skillMdPath, "utf-8"));
        const { frontmatter, body } = parsed;
        if (!frontmatter.trigger)
            return null;
        const tokensEstimate = estimateTokens(body);
        const entry = {
            name: `${author}/${frontmatter.name}`,
            v: frontmatter.version,
            trigger: frontmatter.trigger.description,
            tags: frontmatter.trigger.tags,
            priority: frontmatter.trigger.priority,
            entry: skillMdPath,
            tokens_estimate: tokensEstimate,
            package_type: "skill",
        };
        if (frontmatter.trigger.file_patterns) {
            entry.file_patterns = frontmatter.trigger.file_patterns;
        }
        return entry;
    }
    catch (err) {
        console.error(`Failed to parse skill in ${skillDir}:`, err);
        return null;
    }
}
async function readPersonaEntry(pkgDir, author, name) {
    const soulMdPath = path.join(pkgDir, "SOUL.md");
    try {
        await fs.access(soulMdPath);
    }
    catch {
        return null;
    }
    try {
        const raw = await fs.readFile(soulMdPath, "utf-8");
        const { frontmatter, body } = parseSoul(raw);
        const trigger = frontmatter.skillbase?.trigger;
        const tokensEstimate = estimateTokens(body);
        const entry = {
            name: `${author}/${frontmatter.name}`,
            v: frontmatter.version,
            trigger: trigger?.description ?? frontmatter.description,
            tags: trigger?.tags ?? [],
            priority: trigger?.priority ?? 50,
            entry: soulMdPath,
            tokens_estimate: tokensEstimate,
            package_type: "persona",
        };
        return entry;
    }
    catch (err) {
        console.error(`Failed to parse persona in ${pkgDir}:`, err);
        return null;
    }
}
export async function buildIndex(skillsDir) {
    const installedDir = getInstalledDir(skillsDir);
    const index = { version: "1.0.0", skills: [] };
    let scopes;
    try {
        scopes = await fs.readdir(installedDir);
    }
    catch {
        return index;
    }
    for (const author of scopes) {
        const authorDir = path.join(installedDir, author);
        const stat = await fs.stat(authorDir);
        if (!stat.isDirectory())
            continue;
        const pkgNames = await fs.readdir(authorDir);
        for (const pkgName of pkgNames) {
            const pkgDir = path.join(authorDir, pkgName);
            const pkgStat = await fs.stat(pkgDir);
            if (!pkgStat.isDirectory())
                continue;
            // Try skill first, then persona
            const skillEntry = await readSkillEntry(pkgDir, author, pkgName);
            if (skillEntry) {
                index.skills.push(skillEntry);
                continue;
            }
            const personaEntry = await readPersonaEntry(pkgDir, author, pkgName);
            if (personaEntry) {
                index.skills.push(personaEntry);
            }
        }
    }
    index.skills.sort((a, b) => b.priority - a.priority);
    return index;
}
export async function writeIndex(skillsDir) {
    const index = await buildIndex(skillsDir);
    const indexPath = getIndexPath(skillsDir);
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
    return index;
}
export async function getInstalledMap() {
    const skillsDir = getGlobalSkillsDir();
    const index = await buildIndex(skillsDir);
    const skills = {};
    const personas = {};
    for (const entry of index.skills) {
        if (entry.package_type === "persona") {
            personas[`@${entry.name}`] = entry.v;
        }
        else {
            skills[`@${entry.name}`] = entry.v;
        }
    }
    return { skills, personas };
}
//# sourceMappingURL=indexer.js.map