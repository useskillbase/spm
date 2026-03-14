import { getSkillIndex, findSkill } from "../../core/registry.js";
import { addFeedback } from "../../core/feedback.js";
import { log, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "rate",
  description: "Rate a skill (1-5)",
  group: "registry",
  args: [{ name: "name", required: true }],
  options: [
    { flags: "--score <score>", description: "Rating from 1 to 5", required: true },
    { flags: "--comment <comment>", description: "Optional comment" },
  ],
  handler: rateCommand,
};

export async function rateCommand(
  name: string,
  options: { score: string; comment?: string },
): Promise<void> {
  const score = Number(options.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    exitError("Score must be an integer from 1 to 5.");
  }

  const index = await getSkillIndex();
  const entry = findSkill(index, name);

  if (!entry) {
    exitError(`Skill "${name}" not found. Use "spm list" to see installed skills.`);
  }

  const result = score >= 4 ? "success" : score >= 3 ? "partial" : "failure";

  await addFeedback(name, entry.v, result, "explicit", {
    rating: score,
    comment: options.comment ?? undefined,
  });

  log.success(`Recorded rating ${score}/5 for ${name}@${entry.v} (${result})`);
}
