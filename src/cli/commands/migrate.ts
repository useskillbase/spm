import path from "node:path";
import {
  migrateSkill,
  migratePersona,
  migrateWorkspace,
  migrateAll,
} from "../../core/migrate.js";
import type { MigrateResult } from "../../core/migrate.js";
import { log } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "migrate",
  description: "Migrate v1/v2 formats to v3",
  group: "system",
  subcommands: [
    {
      name: "skill",
      description: "Migrate skill.json + SKILL.md → unified SKILL.md",
      group: "system",
      args: [{ name: "path", required: true, description: "Path to skill directory" }],
      options: [
        { flags: "--dry-run", description: "Preview changes without writing" },
      ],
      handler: migrateSkillCommand,
    },
    {
      name: "persona",
      description: "Migrate .person.json → SOUL.md",
      group: "system",
      args: [{ name: "path", required: true, description: "Path to persona file or directory" }],
      options: [
        { flags: "--dry-run", description: "Preview changes without writing" },
      ],
      handler: migratePersonaCommand,
    },
    {
      name: "workspace",
      description: "Migrate skill.json → skillbase.json (workspace manifest)",
      group: "system",
      args: [{ name: "path", required: false, description: "Project directory (default: .)" }],
      options: [
        { flags: "--dry-run", description: "Preview changes without writing" },
      ],
      handler: migrateWorkspaceCommand,
    },
    {
      name: "all",
      description: "Migrate everything in directory recursively",
      group: "system",
      args: [{ name: "path", required: false, description: "Root directory (default: .)" }],
      options: [
        { flags: "--dry-run", description: "Preview changes without writing" },
      ],
      handler: migrateAllCommand,
    },
  ],
};

async function migrateSkillCommand(
  skillPath: string,
  options: { dryRun?: boolean },
): Promise<void> {
  const resolved = path.resolve(skillPath);
  const result = await migrateSkill(resolved, !!options.dryRun);
  printResult(result, !!options.dryRun);
}

async function migratePersonaCommand(
  personaPath: string,
  options: { dryRun?: boolean },
): Promise<void> {
  const resolved = path.resolve(personaPath);
  const result = await migratePersona(resolved, !!options.dryRun);
  printResult(result, !!options.dryRun);
}

async function migrateWorkspaceCommand(
  workspacePath?: string,
  options?: { dryRun?: boolean },
): Promise<void> {
  const resolved = path.resolve(workspacePath ?? ".");
  const result = await migrateWorkspace(resolved, !!options?.dryRun);
  printResult(result, !!options?.dryRun);
}

async function migrateAllCommand(
  rootPath?: string,
  options?: { dryRun?: boolean },
): Promise<void> {
  const resolved = path.resolve(rootPath ?? ".");
  const dryRun = !!options?.dryRun;
  const results = await migrateAll(resolved, dryRun);

  if (results.length === 0) {
    log.info("Nothing to migrate.");
    return;
  }

  if (dryRun) {
    log.info("Dry run — no files modified:\n");
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const r of results) {
    printResult(r, dryRun);
    if (r.action === "created") created++;
    else if (r.action === "skipped") skipped++;
    else errors++;
  }

  console.log();
  log.info(`Summary: ${created} migrated, ${skipped} skipped, ${errors} errors`);
}

function printResult(result: MigrateResult, dryRun: boolean): void {
  const prefix = dryRun ? "[dry-run] " : "";
  switch (result.action) {
    case "created":
      log.success(`${prefix}${result.source} → ${result.target}`);
      if (result.backup) {
        log.info(`  Backup: ${result.backup}`);
      }
      break;
    case "skipped":
      log.info(`${prefix}Skipped: ${result.source} (already migrated)`);
      break;
    case "error":
      log.error(`${prefix}Error: ${result.source} — ${result.error}`);
      break;
  }
}
