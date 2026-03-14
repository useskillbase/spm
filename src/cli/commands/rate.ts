import { getSkillIndex, findSkill } from "../../core/registry.js";
import { addFeedback } from "../../core/feedback.js";

export async function rateCommand(
  name: string,
  options: { score: string; comment?: string },
): Promise<void> {
  const score = Number(options.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    console.error("Score must be an integer from 1 to 5.");
    process.exit(1);
  }

  const index = await getSkillIndex();
  const entry = findSkill(index, name);

  if (!entry) {
    console.error(`Skill "${name}" not found. Use "spm list" to see installed skills.`);
    process.exit(1);
  }

  const result = score >= 4 ? "success" : score >= 3 ? "partial" : "failure";

  await addFeedback(name, entry.v, result, "explicit", {
    rating: score,
    comment: options.comment ?? undefined,
  });

  console.log(`Recorded rating ${score}/5 for ${name}@${entry.v} (${result})`);
}
