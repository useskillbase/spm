import type { SkillsConfig } from "../types/index.js";
export declare function getDefaultConfig(): SkillsConfig;
export declare function readConfig(skillsDir?: string): Promise<SkillsConfig>;
export declare function writeConfig(config: SkillsConfig, skillsDir?: string): Promise<void>;
export declare function resolveRegistry(config: SkillsConfig, _skillRef: string): string | null;
export declare function getRegistryToken(config: SkillsConfig, registryName: string): string | undefined;
//# sourceMappingURL=config.d.ts.map