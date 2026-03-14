import type { SkillIndex, IndexSkillEntry } from "../types/index.js";
export interface RegistryOptions {
    cwd?: string;
}
/**
 * Reads and merges skill indexes from project-level and global directories.
 * Project skills override global ones by name.
 */
export declare function getSkillIndex(options?: RegistryOptions): Promise<SkillIndex>;
export declare function findSkill(index: SkillIndex, name: string): IndexSkillEntry | undefined;
//# sourceMappingURL=registry.d.ts.map