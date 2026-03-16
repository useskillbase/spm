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
            note(lines.join("\n"), `${skill.name}@${skill.v}`);
        }
    }
    else {
        const lines = index.skills.map((skill) => {
            const tokens = String(skill.tokens_estimate).padStart(5);
            return `${skill.name}@${skill.v}  ${tokens} tokens  [${skill.tags.join(", ")}]`;
        });
        log.info(`${index.skills.length} skill(s) installed`);
        log.message(lines.join("\n"));
    }
}
//# sourceMappingURL=list.js.map