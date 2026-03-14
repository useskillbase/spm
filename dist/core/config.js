import fs from "node:fs/promises";
import { getConfigPath, getGlobalSkillsDir } from "./paths.js";
const DEFAULT_CONFIG = {
    feedback: {
        enabled: true,
        automatic: true,
    },
    tools: {
        skill_list: true,
        skill_load: true,
        skill_context: true,
        skill_feedback: true,
        skill_search: true,
        skill_install: true,
    },
    search: {
        remote_enabled: true,
        auto_suggest: true,
    },
    registries: [
        {
            name: "public",
            url: "https://skillbase-registry.fly.dev",
        },
    ],
    scopes: {
        "*": "public",
    },
};
export function getDefaultConfig() {
    return structuredClone(DEFAULT_CONFIG);
}
export async function readConfig(skillsDir) {
    const dir = skillsDir ?? getGlobalSkillsDir();
    const configPath = getConfigPath(dir);
    try {
        const raw = await fs.readFile(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        return mergeWithDefaults(parsed);
    }
    catch {
        return getDefaultConfig();
    }
}
export async function writeConfig(config, skillsDir) {
    const dir = skillsDir ?? getGlobalSkillsDir();
    const configPath = getConfigPath(dir);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
function mergeWithDefaults(partial) {
    const defaults = getDefaultConfig();
    return {
        feedback: { ...defaults.feedback, ...partial.feedback },
        tools: { ...defaults.tools, ...partial.tools },
        search: { ...defaults.search, ...partial.search },
        registries: partial.registries ?? defaults.registries,
        scopes: partial.scopes ?? defaults.scopes,
        github: partial.github,
    };
}
export function resolveRegistry(config, _skillRef) {
    const registryName = config.scopes["*"];
    if (!registryName)
        return null;
    const registry = config.registries.find((r) => r.name === registryName);
    return registry?.url ?? null;
}
export function getRegistryToken(config, registryName) {
    const registry = config.registries.find((r) => r.name === registryName);
    return registry?.token;
}
//# sourceMappingURL=config.js.map