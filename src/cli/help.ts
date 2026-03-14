import { Command, Help } from "commander";
import { theme } from "./theme.js";
import { GROUPS, type GroupKey } from "./command.js";

const defaultFormatHelp = Help.prototype.formatHelp;

export function configureHelp(program: Command): void {
  program.configureHelp({
    formatHelp(cmd: Command, helper: Help): string {
      const lines: string[] = [];

      // Brand header
      const version = (cmd as unknown as { _version?: string })._version;
      lines.push("");
      if (version) {
        lines.push(`  ${theme.primary("spm")} ${theme.muted(`v${version}`)} ${theme.muted("— AI skills manager")}`);
      } else {
        lines.push(`  ${theme.primary("spm")} ${theme.muted(cmd.name())}`)
      }
      lines.push("");

      // Group subcommands
      const subs = cmd.commands;
      if (subs.length === 0) {
        return defaultFormatHelp.call(helper, cmd, helper);
      }

      const grouped = new Map<string, Array<{ name: string; description: string }>>();

      for (const sub of subs) {
        // Try to find group from the command's metadata
        const group = (sub as unknown as { _group?: string })._group ?? "system";
        if (!grouped.has(group)) {
          grouped.set(group, []);
        }
        grouped.get(group)!.push({
          name: sub.name(),
          description: sub.description(),
        });
      }

      // Sort groups by order
      const sortedGroups = [...grouped.entries()].sort((a, b) => {
        const orderA = GROUPS[a[0] as GroupKey]?.order ?? 99;
        const orderB = GROUPS[b[0] as GroupKey]?.order ?? 99;
        return orderA - orderB;
      });

      // Find max command name length for alignment
      const maxLen = Math.max(...subs.map((s) => s.name().length));

      for (const [groupKey, cmds] of sortedGroups) {
        const label = GROUPS[groupKey as GroupKey]?.label ?? groupKey;
        lines.push(`  ${theme.bold(label)}`);
        for (const c of cmds) {
          const padded = c.name.padEnd(maxLen + 2);
          lines.push(`    ${theme.primary(padded)}${theme.muted(c.description)}`);
        }
        lines.push("");
      }

      // Global options
      const opts = helper.visibleOptions(cmd);
      if (opts.length > 0) {
        const optMaxLen = Math.max(maxLen, ...opts.map((o) => helper.optionTerm(o).length));
        lines.push(`  ${theme.bold("Options")}`);
        for (const opt of opts) {
          const flags = helper.optionTerm(opt).padEnd(optMaxLen + 2);
          lines.push(`    ${flags}  ${theme.muted(helper.optionDescription(opt))}`);
        }
        lines.push("");
      }

      return lines.join("\n");
    },
  });
}

/**
 * Tag a Commander command with a group key for help formatting.
 */
export function setCommandGroup(cmd: Command, group: string): void {
  (cmd as unknown as { _group: string })._group = group;
}
