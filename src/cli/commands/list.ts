import { getSkillIndex } from "../../core/registry.js";

export async function listCommand(options: { verbose?: boolean }): Promise<void> {
  const index = await getSkillIndex();

  if (index.skills.length === 0) {
    console.log("No skills installed.");
    return;
  }

  if (options.verbose) {
    for (const skill of index.skills) {
      console.log(`${skill.name}@${skill.v}`);
      console.log(`  trigger:  ${skill.trigger}`);
      console.log(`  tags:     ${skill.tags.join(", ")}`);
      console.log(`  priority: ${skill.priority}`);
      console.log(`  tokens:   ~${skill.tokens_estimate}`);
      if (skill.file_patterns) {
        console.log(`  patterns: ${skill.file_patterns.join(", ")}`);
      }
      console.log();
    }
  } else {
    for (const skill of index.skills) {
      const tokens = String(skill.tokens_estimate).padStart(5);
      console.log(`  ${skill.name}@${skill.v}  ${tokens} tokens  [${skill.tags.join(", ")}]`);
    }
    console.log(`\n${index.skills.length} skill(s) installed`);
  }
}
