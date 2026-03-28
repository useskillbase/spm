import fs from "node:fs/promises";
import { getSkillIndex, findSkill } from "../../core/registry.js";
import { readConfig } from "../../core/config.js";
import { RegistryClient } from "../../core/registry-client.js";
import { parseSkill } from "../../core/skill-parser.js";
import { note, exitError } from "../ui.js";
export const command = {
    name: "info",
    description: "Show detailed information about a skill",
    group: "review",
    args: [{ name: "name", required: true }],
    handler: infoCommand,
};
export async function infoCommand(name) {
    const index = await getSkillIndex();
    const entry = findSkill(index, name);
    if (!entry) {
        exitError(`Skill "${name}" not found. Use "spm list" to see installed skills.`);
    }
    const lines = [];
    // Try to fetch visibility from registry
    let visibility;
    const slashIdx = entry.name.indexOf("/");
    if (slashIdx !== -1) {
        try {
            const config = await readConfig();
            const registryName = config.scopes["*"];
            const reg = registryName ? config.registries.find((r) => r.name === registryName) : undefined;
            if (reg?.token) {
                const client = new RegistryClient(reg.url, reg.token);
                const author = entry.name.slice(0, slashIdx);
                const skillName = entry.name.slice(slashIdx + 1);
                const remote = await client.getSkill(author, skillName);
                if (remote?.visibility) {
                    visibility = remote.visibility;
                }
            }
        }
        catch {
            // Registry unavailable — skip visibility
        }
    }
    // Read full metadata from SKILL.md
    try {
        const raw = await fs.readFile(entry.entry, "utf-8");
        const parsed = parseSkill(raw);
        const fm = parsed.frontmatter;
        lines.push(`description: ${fm.description}`);
        lines.push(`trigger:     ${entry.trigger}`);
        lines.push(`tags:        ${entry.tags.join(", ")}`);
        lines.push(`priority:    ${entry.priority}`);
        lines.push(`tokens:      ~${entry.tokens_estimate}`);
        lines.push(`entry:       ${entry.entry}`);
        if (entry.file_patterns) {
            lines.push(`patterns:    ${entry.file_patterns.join(", ")}`);
        }
        lines.push(`author:      ${fm.author}`);
        lines.push(`license:     ${fm.license}`);
        if (visibility) {
            lines.push(`visibility:  ${visibility}`);
        }
        lines.push(`permissions: ${fm.security?.permissions.length ? fm.security.permissions.join(", ") : "none"}`);
        if (fm.works_with && fm.works_with.length > 0) {
            lines.push(`works_with:`);
            for (const w of fm.works_with) {
                lines.push(`  - ${w.skill} (${w.relationship}): ${w.description}`);
            }
        }
        const deps = Object.keys(fm.dependencies ?? {});
        if (deps.length > 0) {
            lines.push(`dependencies: ${deps.join(", ")}`);
        }
    }
    catch {
        // Fallback to index data only
        lines.push(`trigger:     ${entry.trigger}`);
        lines.push(`tags:        ${entry.tags.join(", ")}`);
        lines.push(`priority:    ${entry.priority}`);
        lines.push(`tokens:      ~${entry.tokens_estimate}`);
        lines.push(`entry:       ${entry.entry}`);
        if (visibility) {
            lines.push(`visibility:  ${visibility}`);
        }
    }
    note(lines.join("\n"), `${entry.name}@${entry.v}`);
}
//# sourceMappingURL=info.js.map