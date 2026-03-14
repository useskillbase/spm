import fs from "node:fs/promises";
import type {
  FeedbackEntry,
  FeedbackResult,
  FeedbackStore,
  FeedbackType,
  SkillStats,
} from "../types/index.js";
import { getFeedbackPath, getGlobalSkillsDir } from "./paths.js";

// -- Storage --

async function readStore(skillsDir?: string): Promise<FeedbackStore> {
  const dir = skillsDir ?? getGlobalSkillsDir();
  const feedbackPath = getFeedbackPath(dir);

  try {
    const raw = await fs.readFile(feedbackPath, "utf-8");
    return JSON.parse(raw) as FeedbackStore;
  } catch {
    return { entries: [] };
  }
}

async function writeStore(
  store: FeedbackStore,
  skillsDir?: string,
): Promise<void> {
  const dir = skillsDir ?? getGlobalSkillsDir();
  const feedbackPath = getFeedbackPath(dir);
  await fs.writeFile(
    feedbackPath,
    JSON.stringify(store, null, 2) + "\n",
    "utf-8",
  );
}

// -- Public API --

export async function addFeedback(
  skill: string,
  version: string,
  result: FeedbackResult,
  type: FeedbackType = "automatic",
  options?: {
    rating?: number;
    comment?: string;
    task_type?: string;
    file_types?: string[];
    tokens_used?: number;
  },
  skillsDir?: string,
): Promise<FeedbackEntry> {
  const store = await readStore(skillsDir);

  const entry: FeedbackEntry = {
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

export async function getEntriesForSkill(
  skillName: string,
  skillsDir?: string,
): Promise<FeedbackEntry[]> {
  const store = await readStore(skillsDir);
  return store.entries.filter((e) => e.skill === skillName);
}

export async function getAllStats(
  skillsDir?: string,
): Promise<SkillStats[]> {
  const store = await readStore(skillsDir);
  const grouped = new Map<string, FeedbackEntry[]>();

  for (const entry of store.entries) {
    const existing = grouped.get(entry.skill) ?? [];
    existing.push(entry);
    grouped.set(entry.skill, existing);
  }

  const stats: SkillStats[] = [];

  for (const [skill, entries] of grouped) {
    stats.push(computeStats(skill, entries));
  }

  return stats.sort((a, b) => b.confidence - a.confidence);
}

export async function getStatsForSkill(
  skillName: string,
  skillsDir?: string,
): Promise<SkillStats | null> {
  const entries = await getEntriesForSkill(skillName, skillsDir);
  if (entries.length === 0) return null;
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
export function calculateConfidence(
  successRate: number,
  usageCount: number,
): number {
  const usageWeight = Math.min(1, Math.log2(usageCount + 1) / 5);
  return Math.round(successRate * usageWeight * 100) / 100;
}

// -- Internal --

function computeStats(skill: string, entries: FeedbackEntry[]): SkillStats {
  const usageCount = entries.length;

  const successCount = entries.filter(
    (e) => e.result === "success" || e.result === "partial",
  ).length;
  const successRate =
    usageCount > 0 ? Math.round((successCount / usageCount) * 100) / 100 : 0;

  const rated = entries.filter((e) => e.rating !== undefined);
  const avgRating =
    rated.length > 0
      ? Math.round(
          (rated.reduce((sum, e) => sum + e.rating!, 0) / rated.length) * 100,
        ) / 100
      : null;

  const confidence = calculateConfidence(successRate, usageCount);

  return { skill, usage_count: usageCount, success_rate: successRate, avg_rating: avgRating, confidence };
}
