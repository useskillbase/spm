import fs from "node:fs/promises";
import path from "node:path";
import { getGlobalSkillsDir, getInstalledDir } from "../../core/paths.js";
import { writeIndex } from "../../core/indexer.js";
import { writeLock } from "../../core/lock.js";
export async function uninstallCommand(name) {
    // Parse author/skill-name
    const nameParts = name.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/);
    if (!nameParts) {
        console.error(`Error: invalid skill name "${name}". Expected author/name.`);
        process.exit(1);
    }
    const [, author, skillName] = nameParts;
    const skillsDir = getGlobalSkillsDir();
    const installedDir = getInstalledDir(skillsDir);
    const skillDir = path.join(installedDir, author, skillName);
    try {
        await fs.access(skillDir);
    }
    catch {
        console.error(`Error: skill "${name}" is not installed.`);
        process.exit(1);
    }
    await fs.rm(skillDir, { recursive: true });
    // Clean up empty author directory
    const authorDir = path.join(installedDir, author);
    const remaining = await fs.readdir(authorDir);
    if (remaining.length === 0) {
        await fs.rmdir(authorDir);
    }
    // Rebuild index and lock
    const index = await writeIndex(skillsDir);
    await writeLock(skillsDir);
    console.log(`Uninstalled ${name}`);
    console.log(`  ${index.skills.length} skill(s) remaining`);
}
//# sourceMappingURL=uninstall.js.map