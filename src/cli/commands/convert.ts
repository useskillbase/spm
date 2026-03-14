import fs from "node:fs/promises";
import path from "node:path";
import type { SkillManifest } from "../../types/index.js";

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
TODO: one-sentence role definition for the AI model.
</role>

# ${name}

<context>
TODO: explain why this skill exists and what problem it solves.
</context>

<instructions>
${rawContent.trim()}
</instructions>

<examples>
<example>
<input>TODO: describe a typical user request</input>
<output>TODO: show the expected model response</output>
</example>
</examples>

<guidelines>
TODO: add constraints with motivation (use positive framing — what TO do, not what NOT to do).
</guidelines>

<verification>
Before completing, verify:
- [ ] Output matches the expected format
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

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const author =
      options.author ?? (await rl.question("Author name: ")).trim();
    if (!author) {
      console.error("Error: author name is required.");
      process.exit(1);
    }

    const scopeInput = options.scope
      ? options.scope
      : (await rl.question("Scope [user]: ")).trim();
    const scope = scopeInput || "user";

    const licenseInput = options.license
      ? options.license
      : (await rl.question("License [MIT]: ")).trim();
    const license = licenseInput || "MIT";

    return { author, scope, license };
  } finally {
    rl.close();
  }
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
      console.error(`Error: no prompt files (${[...PROMPT_EXTENSIONS].join(", ")}) found in "${source}".`);
      process.exit(1);
    }
    return files.sort();
  }

  console.error(`Error: "${source}" is not a file or directory.`);
  process.exit(1);
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
    console.error(`  Skipped: ${skillDir}/ already exists`);
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
    console.error(`Error: "${source}" does not exist.`);
    process.exit(1);
  }

  const files = await collectPromptFiles(resolvedSource);

  console.log(
    `Found ${files.length} prompt file${files.length > 1 ? "s" : ""}: ${files.map((f) => path.basename(f)).join(", ")}`,
  );
  console.log();

  const meta = await promptSharedMeta(options);
  const outputDir = path.resolve(options.output ?? ".");

  console.log();
  console.log("Converting...");

  const created: string[] = [];
  for (const file of files) {
    const name = await convertFile(file, meta, outputDir);
    if (name) {
      console.log(`  ${name}/  ← ${path.basename(file)}`);
      created.push(name);
    }
  }

  if (created.length === 0) {
    console.log("No skills created.");
    return;
  }

  console.log();
  console.log("Next steps:");
  console.log("  1. Review and edit skill.json in each directory (description, trigger, tags)");
  console.log(`  2. skills validate ./${created[0]}`);
  console.log(`  3. skills install ./${created[0]}`);
}
