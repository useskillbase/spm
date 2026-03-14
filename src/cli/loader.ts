import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import type { CommandDef } from "./command.js";
import { GROUPS, type GroupKey } from "./command.js";
import { setCommandGroup } from "./help.js";

function registerCommand(parent: Command, def: CommandDef): void {
  const nameWithArgs = def.args
    ? `${def.name} ${def.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(" ")}`
    : def.name;

  const cmd = parent.command(nameWithArgs).description(def.description);

  // Tag with group for help formatting
  setCommandGroup(cmd, def.group);

  if (def.aliases) {
    for (const alias of def.aliases) {
      cmd.alias(alias);
    }
  }

  if (def.options) {
    for (const opt of def.options) {
      if (opt.required) {
        cmd.requiredOption(opt.flags, opt.description, opt.default as string);
      } else {
        cmd.option(opt.flags, opt.description, opt.default as string);
      }
    }
  }

  if (def.subcommands) {
    for (const sub of def.subcommands) {
      registerCommand(cmd, sub);
    }
  }

  if (def.handler) {
    cmd.action(def.handler);
  }
}

export async function loadCommands(program: Command): Promise<void> {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const commandsDir = path.join(dirname, "commands");
  const files = await fs.readdir(commandsDir);

  const definitions: CommandDef[] = [];

  for (const file of files) {
    if (!file.endsWith(".js") && !file.endsWith(".ts")) continue;
    // Skip .d.ts and .test files
    if (file.endsWith(".d.ts") || file.includes(".test.")) continue;

    const mod = (await import(path.join(commandsDir, file))) as Record<string, unknown>;
    if (mod.command) definitions.push(mod.command as CommandDef);
    if (mod.commands && Array.isArray(mod.commands)) {
      definitions.push(...(mod.commands as CommandDef[]));
    }
  }

  // Sort by group order, then alphabetically
  definitions.sort((a, b) => {
    const groupA = GROUPS[a.group as GroupKey];
    const groupB = GROUPS[b.group as GroupKey];
    const orderA = groupA?.order ?? 99;
    const orderB = groupB?.order ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  for (const def of definitions) {
    registerCommand(program, def);
  }
}
