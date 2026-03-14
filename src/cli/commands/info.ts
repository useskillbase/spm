import fs from "node:fs/promises";
import path from "node:path";
import { getSkillIndex, findSkill } from "../../core/registry.js";
import type { SkillManifest } from "../../types/index.js";
import { note, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "info",
  description: "Show detailed information about a skill",
  group: "review",
  args: [{ name: "name", required: true }],
  handler: infoCommand,
};

export async function infoCommand(name: string): Promise<void> {
  const index = await getSkillIndex();
  const entry = findSkill(index, name);

  if (!entry) {
    exitError(`Skill "${name}" not found. Use "spm list" to see installed skills.`);
  }

  // Read full manifest
  const skillDir = path.dirname(entry.entry);
  const manifestPath = path.join(skillDir, "skill.json");
  let manifest: SkillManifest | null = null;
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    manifest = JSON.parse(raw) as SkillManifest;
  } catch {
    // Continue with index data only
  }

  const lines: string[] = [];

  if (manifest) {
    lines.push(`description: ${manifest.description}`);
  }
  lines.push(`trigger:     ${entry.trigger}`);
  lines.push(`tags:        ${entry.tags.join(", ")}`);
  lines.push(`priority:    ${entry.priority}`);
  lines.push(`tokens:      ~${entry.tokens_estimate}`);
  lines.push(`entry:       ${entry.entry}`);

  if (entry.file_patterns) {
    lines.push(`patterns:    ${entry.file_patterns.join(", ")}`);
  }

  if (manifest) {
    lines.push(`author:      ${manifest.author}`);
    lines.push(`license:     ${manifest.license}`);
    lines.push(`permissions: ${manifest.security?.permissions.length ? manifest.security.permissions.join(", ") : "none"}`);

    if (manifest.works_with && manifest.works_with.length > 0) {
      lines.push(`works_with:`);
      for (const w of manifest.works_with) {
        lines.push(`  - ${w.skill} (${w.relationship}): ${w.description}`);
      }
    }

    const deps = Object.keys(manifest.dependencies);
    if (deps.length > 0) {
      lines.push(`dependencies: ${deps.join(", ")}`);
    }
  }

  note(lines.join("\n"), `${entry.name}@${entry.v}`);
}
