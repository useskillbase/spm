import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getInstalledDir } from "./paths.js";
async function hashDirectory(dir) {
    const hash = crypto.createHash("sha256");
    const entries = await fs.readdir(dir, { recursive: true });
    entries.sort();
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.toString());
        const stat = await fs.stat(fullPath);
        if (stat.isFile()) {
            const content = await fs.readFile(fullPath);
            hash.update(content);
        }
    }
    return hash.digest("hex");
}
async function estimateTokensForFile(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        return Math.ceil(content.length / 4);
    }
    catch {
        return 0;
    }
}
export async function buildLock(skillsDir) {
    const installedDir = getInstalledDir(skillsDir);
    const lock = {
        lock_version: 1,
        generated: new Date().toISOString(),
        total_tokens_estimate: 0,
        skills: {},
    };
    let scopes;
    try {
        scopes = await fs.readdir(installedDir);
    }
    catch {
        return lock;
    }
    for (const author of scopes) {
        const authorDir = path.join(installedDir, author);
        const stat = await fs.stat(authorDir);
        if (!stat.isDirectory())
            continue;
        const skillNames = await fs.readdir(authorDir);
        for (const skillName of skillNames) {
            const skillDir = path.join(authorDir, skillName);
            const skillStat = await fs.stat(skillDir);
            if (!skillStat.isDirectory())
                continue;
            const manifestPath = path.join(skillDir, "skill.json");
            let manifest;
            try {
                const raw = await fs.readFile(manifestPath, "utf-8");
                manifest = JSON.parse(raw);
            }
            catch {
                continue;
            }
            const integrity = await hashDirectory(skillDir);
            const tokensEstimate = manifest.entry
                ? await estimateTokensForFile(path.join(skillDir, manifest.entry))
                : 0;
            const entry = {
                version: manifest.version,
                resolved: skillDir,
                integrity: `sha256-${integrity}`,
                tokens_estimate: tokensEstimate,
                dependencies: manifest.dependencies,
            };
            lock.skills[manifest.name] = entry;
            lock.total_tokens_estimate += tokensEstimate;
        }
    }
    return lock;
}
export async function writeLock(skillsDir) {
    const lock = await buildLock(skillsDir);
    const lockPath = path.join(skillsDir, "skills.lock");
    await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), "utf-8");
    return lock;
}
//# sourceMappingURL=lock.js.map