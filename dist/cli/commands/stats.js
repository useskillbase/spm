import { getAllStats } from "../../core/feedback.js";
export async function statsCommand() {
    const stats = await getAllStats();
    if (stats.length === 0) {
        console.log("No feedback recorded yet. Use skills or call skill_feedback via MCP.");
        return;
    }
    const nameWidth = Math.max(10, ...stats.map((s) => s.skill.length));
    const header = pad("Skill", nameWidth) +
        pad("Uses", 8) +
        pad("Success", 10) +
        pad("Rating", 9) +
        "Confidence";
    console.log(header);
    console.log("-".repeat(header.length));
    for (const s of stats) {
        const successPct = `${Math.round(s.success_rate * 100)}%`;
        const rating = s.avg_rating !== null ? s.avg_rating.toFixed(1) : "-";
        const confidence = s.confidence.toFixed(2);
        const warning = s.confidence < 0.5 ? " \u26A0" : "";
        console.log(pad(s.skill, nameWidth) +
            pad(String(s.usage_count), 8) +
            pad(successPct, 10) +
            pad(rating, 9) +
            confidence +
            warning);
    }
    console.log(`\n${stats.length} skill(s) with feedback`);
}
function pad(str, width) {
    return str.padEnd(width);
}
//# sourceMappingURL=stats.js.map