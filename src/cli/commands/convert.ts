import fs from "node:fs/promises";
import path from "node:path";
import type { SkillManifest } from "../../types/index.js";
import { log, spinner, note, cancel, isCancel, text, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "convert",
  description: "Convert prompt files (.md, .txt) into skill scaffolds",
  group: "system",
  args: [{ name: "source", required: true }],
  options: [
    { flags: "--author <author>", description: "Author name" },
    { flags: "--scope <scope>", description: "Skill scope (default: user)" },
    { flags: "--license <license>", description: "License (default: MIT)" },
    { flags: "-o, --output <dir>", description: "Output directory (default: current)" },
  ],
  handler: convertCommand,
};

interface ConvertOptions {
  author?: string;
  scope?: string;
  license?: string;
  output?: string;
}

interface SharedMeta {
  author: string;
  scope: string;
  license: string;
}

const PROMPT_EXTENSIONS = new Set([".md", ".txt", ".prompt"]);

// XML tags used in the structured skill template
const STRUCTURE_MARKERS = ["<role>", "<context>", "<instructions>", "<examples>", "<guidelines>", "<verification>"];

function hasStructuredFormat(content: string): boolean {
  return STRUCTURE_MARKERS.some((marker) => content.includes(marker));
}

function wrapInStructuredTemplate(name: string, rawContent: string): string {
  // If already structured with XML tags, preserve as-is
  if (hasStructuredFormat(rawContent)) {
    return rawContent;
  }

  return `<role>
TODO: one-sentence role definition that sets expertise and tone.
</role>

# ${name}

<context>
TODO: explain why this skill exists — what problem it solves and what the user is trying to achieve.
</context>

<instructions>
${rawContent.trim()}

## Output format

TODO: define the exact structure of the model's response.
</instructions>

<examples>
TODO: provide 3-5 diverse examples covering typical requests, edge cases, and ambiguous inputs.

<example>
<input>TODO: typical user request</input>
<output>TODO: expected model response following the output format</output>
</example>

<example>
<input>TODO: edge case</input>
<output>TODO: how the model handles this gracefully</output>
</example>

<example>
<input>TODO: ambiguous request</input>
<output>TODO: how the model clarifies or states assumptions</output>
</example>
</examples>

<guidelines>
TODO: cross-cutting principles (positive framing, include WHY for each).

- Always ... (because ...)
- Prefer ... over ... (this ensures ...)
</guidelines>

<verification>
Before completing, verify:
- [ ] Output follows the format defined in instructions
- [ ] Edge cases are handled
</verification>
`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildManifest(
  skillName: string,
  meta: SharedMeta,
): SkillManifest {
  return {
    schema_version: 1,
    name: skillName,
    version: "1.0.0",
    language: "en",
    description: `TODO: describe what ${skillName} does`,
    trigger: {
      description: `TODO: describe when to use ${skillName}`,
      tags: [skillName],
      priority: 50,
    },
    dependencies: {},
    compatibility: {
      min_context_tokens: 1000,
      requires: [],
      models: [],
    },
    entry: "SKILL.md",
    security: {
      permissions: [],
    },
    author: meta.author,
    license: meta.license,
  };
}

async function promptSharedMeta(options: ConvertOptions): Promise<SharedMeta> {
  // If all values provided via flags, skip interactive
  if (options.author && options.scope && options.license) {
    return {
      author: options.author,
      scope: options.scope,
      license: options.license,
    };
  }

  const author = options.author ?? await text({
    message: "Author name:",
    validate: (v) => (v?.trim() ? undefined : "Author name is required"),
  });
  if (isCancel(author)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  const scope = options.scope ?? await text({
    message: "Scope:",
    defaultValue: "user",
    placeholder: "user",
  });
  if (isCancel(scope)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  const license = options.license ?? await text({
    message: "License:",
    defaultValue: "MIT",
    placeholder: "MIT",
  });
  if (isCancel(license)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return {
    author: String(author).trim(),
    scope: String(scope) || "user",
    license: String(license) || "MIT",
  };
}

async function collectPromptFiles(source: string): Promise<string[]> {
  const stat = await fs.stat(source);

  if (stat.isFile()) {
    return [source];
  }

  if (stat.isDirectory()) {
    const entries = await fs.readdir(source, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isFile() && PROMPT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(path.join(source, entry.name));
      }
    }
    if (files.length === 0) {
      exitError(`No prompt files (${[...PROMPT_EXTENSIONS].join(", ")}) found in "${source}".`);
    }
    return files.sort();
  }

  exitError(`"${source}" is not a file or directory.`);
}

async function convertFile(
  filePath: string,
  meta: SharedMeta,
  outputDir: string,
): Promise<string> {
  const baseName = path.basename(filePath, path.extname(filePath));
  const skillName = slugify(baseName);
  const skillDir = path.join(outputDir, skillName);

  try {
    await fs.access(skillDir);
    log.warning(`Skipped: ${skillDir}/ already exists`);
    return "";
  } catch {
    // Does not exist — good
  }

  const rawContent = await fs.readFile(filePath, "utf-8");
  const manifest = buildManifest(skillName, meta);

  await fs.mkdir(skillDir, { recursive: true });

  await fs.writeFile(
    path.join(skillDir, "skill.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  const content = wrapInStructuredTemplate(skillName, rawContent);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf-8");

  return skillName;
}

export async function convertCommand(
  source: string,
  options: ConvertOptions,
): Promise<void> {
  const resolvedSource = path.resolve(source);

  try {
    await fs.access(resolvedSource);
  } catch {
    exitError(`"${source}" does not exist.`);
  }

  const files = await collectPromptFiles(resolvedSource);

  log.info(
    `Found ${files.length} prompt file${files.length > 1 ? "s" : ""}: ${files.map((f) => path.basename(f)).join(", ")}`,
  );

  const meta = await promptSharedMeta(options);
  const outputDir = path.resolve(options.output ?? ".");

  const s = spinner();
  s.start("Converting...");

  const created: string[] = [];
  for (const file of files) {
    const name = await convertFile(file, meta, outputDir);
    if (name) {
      created.push(name);
    }
  }

  if (created.length === 0) {
    s.stop("No skills created.");
    return;
  }

  s.stop(`Converted ${created.length} file(s)`);

  for (const name of created) {
    log.success(`${name}/`);
  }

  note(
    `1. Review and edit skill.json in each directory (description, trigger, tags)\n2. skills validate ./${created[0]}\n3. skills install ./${created[0]}`,
    "Next steps",
  );
}
