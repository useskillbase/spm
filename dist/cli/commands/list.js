import path from "node:path";
import { getSkillIndex } from "../../core/registry.js";
import { log, note } from "../ui.js";
export const command = {
    name: "list",
    description: "List installed skills",
    group: "review",
    aliases: ["ls"],
    options: [
        { flags: "-v, --verbose", description: "Show detailed information" },
    ],
    handler: listCommand,
};
export async function listCommand(options) {
    const index = await getSkillIndex();
    if (index.skills.length === 0) {
        log.info("No skills installed.");
        return;
    }
    // Extract author/name from entry path: .../installed/<author>/<name>/...
    function displayName(skill) {
        const parts = skill.entry.split(path.sep);
        const installedIdx = parts.lastIndexOf("installed");
        if (installedIdx >= 0 && installedIdx + 2 < parts.length) {
            return `${parts[installedIdx + 1]}/${parts[installedIdx + 2]}`;
        }
        return skill.name;
    }
    if (options.verbose) {
        for (const skill of index.skills) {
            const lines = [
                `trigger:  ${skill.trigger}`,
                `tags:     ${skill.tags.join(", ")}`,
                `priority: ${skill.priority}`,
                `tokens:   ~${skill.tokens_estimate}`,
            ];
            if (skill.file_patterns) {
                lines.push(`patterns: ${skill.file_patterns.join(", ")}`);
            }
            note(lines.join("\n"), `${displayName(skill)}@${skill.v}`);
        }
    }
    else {
        const lines = index.skills.map((skill) => {
            const tokens = String(skill.tokens_estimate).padStart(5);
            return `${displayName(skill)}@${skill.v}  ${tokens} tokens  [${skill.tags.join(", ")}]`;
        });
        log.info(`${index.skills.length} skill(s) installed`);
        log.message(lines.join("\n"));
    }
}
//# sourceMappingURL=list.js.map