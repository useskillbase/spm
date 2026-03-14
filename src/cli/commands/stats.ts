import { getAllStats } from "../../core/feedback.js";
import { log, note } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "stats",
  description: "Show feedback statistics for installed skills",
  group: "registry",
  handler: statsCommand,
};

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

export async function statsCommand(): Promise<void> {
  const stats = await getAllStats();

  if (stats.length === 0) {
    log.info("No feedback recorded yet. Use skills or call skill_feedback via MCP.");
    return;
  }

  const nameWidth = Math.max(10, ...stats.map((s) => s.skill.length));

  const header =
    pad("Skill", nameWidth) +
    pad("Uses", 8) +
    pad("Success", 10) +
    pad("Rating", 9) +
    "Confidence";

  const rows = stats.map((s) => {
    const successPct = `${Math.round(s.success_rate * 100)}%`;
    const rating = s.avg_rating !== null ? s.avg_rating.toFixed(1) : "-";
    const confidence = s.confidence.toFixed(2);
    const warning = s.confidence < 0.5 ? " \u26A0" : "";

    return (
      pad(s.skill, nameWidth) +
      pad(String(s.usage_count), 8) +
      pad(successPct, 10) +
      pad(rating, 9) +
      confidence +
      warning
    );
  });

  const table = [header, "-".repeat(header.length), ...rows].join("\n");
  note(table, `Skill Statistics (${stats.length})`);
}
