import fs from "node:fs/promises";
import { getFeedbackPath, getGlobalSkillsDir } from "./paths.js";
// -- Storage --
async function readStore(skillsDir) {
    const dir = skillsDir ?? getGlobalSkillsDir();
    const feedbackPath = getFeedbackPath(dir);
    try {
        const raw = await fs.readFile(feedbackPath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return { entries: [] };
    }
}
async function writeStore(store, skillsDir) {
    const dir = skillsDir ?? getGlobalSkillsDir();
    const feedbackPath = getFeedbackPath(dir);
    await fs.writeFile(feedbackPath, JSON.stringify(store, null, 2) + "\n", "utf-8");
}
// -- Public API --
export async function addFeedback(skill, version, result, type = "automatic", options, skillsDir) {
    const store = await readStore(skillsDir);
    const entry = {
        skill,
        version,
        timestamp: new Date().toISOString(),
        type,
        result,
        ...(options?.rating !== undefined && { rating: options.rating }),
        ...(options?.comment && { comment: options.comment }),
        ...((options?.task_type || options?.file_types || options?.tokens_used) && {
            context: {
                ...(options.task_type && { task_type: options.task_type }),
                ...(options.file_types && { file_types: options.file_types }),
                ...(options.tokens_used && { tokens_used: options.tokens_used }),
            },
        }),
    };
    store.entries.push(entry);
    await writeStore(store, skillsDir);
    return entry;
}
export async function getEntriesForSkill(skillName, skillsDir) {
    const store = await readStore(skillsDir);
    return store.entries.filter((e) => e.skill === skillName);
}
export async function getAllStats(skillsDir) {
    const store = await readStore(skillsDir);
    const grouped = new Map();
    for (const entry of store.entries) {
        const existing = grouped.get(entry.skill) ?? [];
        existing.push(entry);
        grouped.set(entry.skill, existing);
    }
    const stats = [];
    for (const [skill, entries] of grouped) {
        stats.push(computeStats(skill, entries));
    }
    return stats.sort((a, b) => b.confidence - a.confidence);
}
export async function getStatsForSkill(skillName, skillsDir) {
    const entries = await getEntriesForSkill(skillName, skillsDir);
    if (entries.length === 0)
        return null;
    return computeStats(skillName, entries);
}
// -- Confidence calculation --
/**
 * Confidence = success_rate × usage_weight
 * usage_weight = min(1, log2(usage_count + 1) / 5)
 *
 * This ensures:
 * - New skills (few uses) have low confidence regardless of success rate
 * - Well-used skills converge toward their true success rate
 * - ~32 uses needed for usage_weight to reach 1.0
 */
export function calculateConfidence(successRate, usageCount) {
    const usageWeight = Math.min(1, Math.log2(usageCount + 1) / 5);
    return Math.round(successRate * usageWeight * 100) / 100;
}
// -- Internal --
function computeStats(skill, entries) {
    const usageCount = entries.length;
    const successCount = entries.filter((e) => e.result === "success" || e.result === "partial").length;
    const successRate = usageCount > 0 ? Math.round((successCount / usageCount) * 100) / 100 : 0;
    const rated = entries.filter((e) => e.rating !== undefined);
    const avgRating = rated.length > 0
        ? Math.round((rated.reduce((sum, e) => sum + e.rating, 0) / rated.length) * 100) / 100
        : null;
    const confidence = calculateConfidence(successRate, usageCount);
    return { skill, usage_count: usageCount, success_rate: successRate, avg_rating: avgRating, confidence };
}
//# sourceMappingURL=feedback.js.map