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
        persona_load: true,
        persona_list: true,
        persona_install: true,
        skill_exec: true,
        sync_status: true,
        sync_environment: true,
        sync_install: true,
        sync_project_prompt: true,
        sync_project_list: true,
        sync_project_create: true,
        sync_project_update: true,
        sync_project_bind: true,
        sync_feature_load: true,
        sync_feature_create: true,
        sync_feature_edit: true,
        sync_feature_update: true,
        sync_feature_delete: true,
        sync_feature_diff: true,
        sync_search: true,
    },
    search: {
        remote_enabled: true,
        auto_suggest: true,
    },
    registries: [
        {
            name: "public",
            url: "https://registry.skillbase.space",
        },
    ],
    scopes: {
        "*": "public",
    },
    active_persona: null,
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
    await fs.mkdir(dir, { recursive: true });
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
        active_persona: partial.active_persona ?? defaults.active_persona,
        github: partial.github,
        sync: partial.sync,
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
    if (process.env.SPM_TOKEN)
        return process.env.SPM_TOKEN;
    const registry = config.registries.find((r) => r.name === registryName);
    return registry?.token;
}
//# sourceMappingURL=config.js.map