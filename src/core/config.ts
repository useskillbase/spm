import fs from "node:fs/promises";
import type { SkillsConfig } from "../types/index.js";
import { getConfigPath, getGlobalSkillsDir } from "./paths.js";

const DEFAULT_CONFIG: SkillsConfig = {
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
  active_persona: null,
};

export function getDefaultConfig(): SkillsConfig {
  return structuredClone(DEFAULT_CONFIG);
}

export async function readConfig(skillsDir?: string): Promise<SkillsConfig> {
  const dir = skillsDir ?? getGlobalSkillsDir();
  const configPath = getConfigPath(dir);

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SkillsConfig>;
    return mergeWithDefaults(parsed);
  } catch {
    return getDefaultConfig();
  }
}

export async function writeConfig(
  config: SkillsConfig,
  skillsDir?: string,
): Promise<void> {
  const dir = skillsDir ?? getGlobalSkillsDir();
  const configPath = getConfigPath(dir);
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function mergeWithDefaults(partial: Partial<SkillsConfig>): SkillsConfig {
  const defaults = getDefaultConfig();
  return {
    feedback: { ...defaults.feedback, ...partial.feedback },
    tools: { ...defaults.tools, ...partial.tools },
    search: { ...defaults.search, ...partial.search },
    registries: partial.registries ?? defaults.registries,
    scopes: partial.scopes ?? defaults.scopes,
    active_persona: partial.active_persona ?? defaults.active_persona,
    github: partial.github,
  };
}

export function resolveRegistry(
  config: SkillsConfig,
  _skillRef: string,
): string | null {
  const registryName = config.scopes["*"];
  if (!registryName) return null;

  const registry = config.registries.find((r) => r.name === registryName);
  return registry?.url ?? null;
}

export function getRegistryToken(
  config: SkillsConfig,
  registryName: string,
): string | undefined {
  const registry = config.registries.find((r) => r.name === registryName);
  return registry?.token;
}
