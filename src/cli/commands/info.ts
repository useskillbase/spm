import fs from "node:fs/promises";
import path from "node:path";
import { getSkillIndex, findSkill } from "../../core/registry.js";
import type { SkillManifest } from "../../types/index.js";

export async function infoCommand(name: string): Promise<void> {
  const index = await getSkillIndex();
  const entry = findSkill(index, name);

  if (!entry) {
    console.error(`Skill "${name}" not found. Use "spm list" to see installed skills.`);
    process.exit(1);
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

  console.log(`${entry.name}@${entry.v}`);
  console.log();
  if (manifest) {
    console.log(`  description: ${manifest.description}`);
  }
  console.log(`  trigger:     ${entry.trigger}`);
  console.log(`  tags:        ${entry.tags.join(", ")}`);
  console.log(`  priority:    ${entry.priority}`);
  console.log(`  tokens:      ~${entry.tokens_estimate}`);
  console.log(`  entry:       ${entry.entry}`);

  if (entry.file_patterns) {
    console.log(`  patterns:    ${entry.file_patterns.join(", ")}`);
  }

  if (manifest) {
    console.log(`  author:      ${manifest.author}`);
    console.log(`  license:     ${manifest.license}`);
    console.log(`  permissions: ${manifest.security?.permissions.length ? manifest.security.permissions.join(", ") : "none"}`);

    if (manifest.works_with && manifest.works_with.length > 0) {
      console.log(`  works_with:`);
      for (const w of manifest.works_with) {
        console.log(`    - ${w.skill} (${w.relationship}): ${w.description}`);
      }
    }

    const deps = Object.keys(manifest.dependencies);
    if (deps.length > 0) {
      console.log(`  dependencies: ${deps.join(", ")}`);
    }
  }
}
