export interface CommandDef {
  name: string;
  description: string;
  group: string;
  aliases?: string[];
  args?: Array<{ name: string; required: boolean; description?: string }>;
  options?: Array<{
    flags: string;
    description: string;
    default?: unknown;
    required?: boolean;
  }>;
  subcommands?: CommandDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler?: (...args: any[]) => Promise<void>;
}

export const GROUPS = {
  manage:   { label: "Manage skills",  order: 0 },
  review:   { label: "Review",         order: 1 },
  personas: { label: "Personas",       order: 2 },
  registry: { label: "Registry",       order: 3 },
  system:   { label: "System",         order: 4 },
} as const;

export type GroupKey = keyof typeof GROUPS;
