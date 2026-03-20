import type { SkillIndex } from "../types/index.js";
export interface InstalledMap {
    skills: Record<string, string>;
    personas: Record<string, string>;
}
export declare function buildIndex(skillsDir: string): Promise<SkillIndex>;
export declare function writeIndex(skillsDir: string): Promise<SkillIndex>;
export declare function getInstalledMap(): Promise<InstalledMap>;
//# sourceMappingURL=indexer.d.ts.map