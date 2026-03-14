import type { FeedbackEntry, FeedbackResult, FeedbackType, SkillStats } from "../types/index.js";
export declare function addFeedback(skill: string, version: string, result: FeedbackResult, type?: FeedbackType, options?: {
    rating?: number;
    comment?: string;
    task_type?: string;
    file_types?: string[];
    tokens_used?: number;
}, skillsDir?: string): Promise<FeedbackEntry>;
export declare function getEntriesForSkill(skillName: string, skillsDir?: string): Promise<FeedbackEntry[]>;
export declare function getAllStats(skillsDir?: string): Promise<SkillStats[]>;
export declare function getStatsForSkill(skillName: string, skillsDir?: string): Promise<SkillStats | null>;
/**
 * Confidence = success_rate × usage_weight
 * usage_weight = min(1, log2(usage_count + 1) / 5)
 *
 * This ensures:
 * - New skills (few uses) have low confidence regardless of success rate
 * - Well-used skills converge toward their true success rate
 * - ~32 uses needed for usage_weight to reach 1.0
 */
export declare function calculateConfidence(successRate: number, usageCount: number): number;
//# sourceMappingURL=feedback.d.ts.map