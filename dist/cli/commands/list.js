import { getSkillIndex } from "../../core/registry.js";
import { readConfig } from "../../core/config.js";
import { RegistryClient } from "../../core/registry-client.js";
import { log, note, spinner, exitError } from "../ui.js";
export const command = {
    name: "list",
    description: "List installed skills",
    group: "review",
    aliases: ["ls"],
    options: [
        { flags: "-v, --verbose", description: "Show detailed information" },
        { flags: "--mine", description: "List your packages from the registry" },
        { flags: "--registry <name>", description: "Use a specific registry (with --mine)" },
    ],
    handler: listCommand,
};
export async function listCommand(options) {
    if (options.mine) {
        await listMine(options.registry);
        return;
    }
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
async function listMine(registryName) {
    const config = await readConfig();
    if (!registryName) {
        registryName = config.scopes["*"];
    }
    if (!registryName) {
        exitError("No default registry configured. Use 'spm login <url>' first.");
    }
    const reg = config.registries.find((r) => r.name === registryName);
    if (!reg) {
        exitError(`Registry "${registryName}" not found in config.`);
    }
    if (!reg.token) {
        exitError(`No token for registry "${registryName}". Use 'spm login' first.`);
    }
    const client = new RegistryClient(reg.url, reg.token);
    const s = spinner();
    s.start("Fetching your packages...");
    const result = await client.getMine();
    s.stop(`${result.total} package(s) found`);
    if (result.skills.length === 0) {
        log.info("You have no published packages.");
        return;
    }
    const lines = result.skills.map((sk) => {
        const vis = sk.visibility === "private" ? " [private]" : "";
        const type = sk.package_type === "persona" ? " (persona)" : "";
        return `${sk.name}@${sk.version}${type}${vis}  ${sk.installs} installs`;
    });
    log.message(lines.join("\n"));
}
//# sourceMappingURL=list.js.map