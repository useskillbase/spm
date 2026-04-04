import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { readConfig } from "../../core/config.js";
import { parseGitHubUrl, downloadSkillFiles, createOctokit } from "../../core/github/client.js";
import { convertVercelToSpm, isVercelFormat } from "../../core/converters/vercel-to-spm.js";
import { validateSkillFrontmatter } from "../../schema/skill-schema.js";
import { serializeSkill } from "../../core/skill-parser.js";
import { log, spinner, note, cancel, isCancel, text, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "convert",
  description: "Convert prompt files or GitHub skills into SPM format",
  group: "system",
  args: [{ name: "source", required: true }],
  options: [
    { flags: "--author <author>", description: "Author name" },
    { flags: "--scope <scope>", description: "Skill scope (default: user)" },
    { flags: "--license <license>", description: "License (default: MIT)" },
    { flags: "-o, --output <dir>", description: "Output directory (default: current)" },
    { flags: "--skill <name>", description: "Skill name to fetch from repo (maps to skills/<name>/)" },
    { flags: "--github <token>", description: "GitHub personal access token for private repos" },
    { flags: "--ref <ref>", description: "Git branch or tag" },
  ],
  handler: convertCommand,
};

interface ConvertOptions {
  author?: string;
  scope?: string;
  license?: string;
  output?: string;
  skill?: string;
  github?: string;
  ref?: string;
}

interface SharedMeta {
  author: string;
  scope: string;
  license: string;
}

const PROMPT_EXTENSIONS = new Set([".md", ".txt", ".prompt"]);

const STRUCTURE_MARKERS = ["<context>", "<instructions>", "<examples>", "<guidelines>", "<verification>"];

function hasStructuredFormat(content: string): boolean {
  return STRUCTURE_MARKERS.some((marker) => content.includes(marker));
}

function wrapInStructuredTemplate(name: string, rawContent: string): string {
  if (hasStructuredFormat(rawContent)) {
    return rawContent;
  }

  return `# ${name}

<context>
TODO: explain what this skill does — what problem it solves, what expertise it brings,
and what the user is trying to achieve.
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

function buildFrontmatter(
  skillName: string,
  meta: SharedMeta,
): Record<string, unknown> {
  return {
    schema_version: 3,
    name: skillName,
    version: "1.0.0",
    author: meta.author,
    license: meta.license,
    description: `TODO: describe what ${skillName} does`,
    language: "en",
    trigger: {
      description: `TODO: describe when to use ${skillName}`,
      tags: [skillName],
      priority: 50,
    },
    security: {
      permissions: [],
    },
  };
}

async function promptSharedMeta(options: ConvertOptions): Promise<SharedMeta> {
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
  const frontmatter = buildFrontmatter(skillName, meta);
  const body = wrapInStructuredTemplate(skillName, rawContent);

  await fs.mkdir(skillDir, { recursive: true });

  const skillMd = matter.stringify(body, frontmatter);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");

  return skillName;
}

// --- GitHub source detection ---

function isGitHubSource(source: string): boolean {
  if (source.includes("github.com") || source.startsWith("github:")) return true;
  // owner/repo or owner/repo/path pattern
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(source) && !source.startsWith(".")) return true;
  return false;
}

async function promptAuthor(options: ConvertOptions): Promise<string> {
  if (options.author) return options.author;

  const author = await text({
    message: "Author name for converted skill:",
    validate: (v) => (v?.trim() ? undefined : "Author name is required"),
  });
  if (isCancel(author)) {
    cancel("Cancelled.");
    process.exit(0);
  }
  return String(author).trim();
}

async function listRepoSkills(
  owner: string,
  repo: string,
  ref: string | undefined,
  token: string | undefined,
): Promise<string[]> {
  const octokit = createOctokit(token);
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      ref: ref ?? undefined,
      path: "skills",
    });

    if (!Array.isArray(response.data)) return [];

    return response.data
      .filter((item: { type: string }) => item.type === "dir")
      .map((item: { name: string }) => item.name);
  } catch {
    return [];
  }
}

async function convertFromGitHub(
  source: string,
  options: ConvertOptions,
): Promise<void> {
  const ghSource = parseGitHubUrl(source);

  // If --skill provided, set the path to skills/<skill-name>
  if (options.skill) {
    ghSource.path = ghSource.path
      ? `${ghSource.path}/skills/${options.skill}`
      : `skills/${options.skill}`;
  }

  if (options.ref) {
    ghSource.ref = options.ref;
  }

  // If no --skill and no explicit path, list available skills
  if (!options.skill && !ghSource.path) {
    const s = spinner();
    s.start(`Scanning ${ghSource.owner}/${ghSource.repo} for skills...`);

    const config = await readConfig();
    const token = options.github ?? config.github?.token;
    const available = await listRepoSkills(ghSource.owner, ghSource.repo, ghSource.ref, token);

    s.stop("Done");

    if (available.length === 0) {
      exitError(
        `No skills/ directory found in ${ghSource.owner}/${ghSource.repo}.\n` +
        `Specify a path directly: spm convert ${source}/path/to/skill -o ./`,
      );
    }

    log.info(`Available skills in ${ghSource.owner}/${ghSource.repo}:`);
    for (const name of available) {
      log.step(`  ${name}`);
    }
    log.info(`\nConvert a specific skill:`);
    log.step(`  spm convert ${source}/${available[0]} -o ./`);
    return;
  }

  const s = spinner();
  s.start(`Fetching from GitHub: ${ghSource.owner}/${ghSource.repo}${ghSource.path ? `/${ghSource.path}` : ""}...`);

  const config = await readConfig();
  const token = options.github ?? config.github?.token;

  let files: Map<string, string>;

  // Try skills/ prefix first (standard convention), then direct path
  if (ghSource.path && !ghSource.path.startsWith("skills/")) {
    const skillsPath = `skills/${ghSource.path}`;
    try {
      files = await downloadSkillFiles({ ...ghSource, path: skillsPath }, token);
      ghSource.path = skillsPath;
    } catch {
      try {
        files = await downloadSkillFiles(ghSource, token);
      } catch (err) {
        s.stop("Failed");
        exitError(`Failed to fetch from GitHub: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    try {
      files = await downloadSkillFiles(ghSource, token);
    } catch (err) {
      s.stop("Failed");
      exitError(`Failed to fetch from GitHub: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const skillMdRaw = files.get("SKILL.md");
  if (!skillMdRaw) {
    s.stop("Failed");
    exitError(
      `SKILL.md not found at ${ghSource.path ?? "root"} in ${ghSource.owner}/${ghSource.repo}.\n` +
      `Use --skill <name> if the skill is inside a skills/ directory.`,
    );
  }

  s.stop("Fetched");

  // Parse the raw SKILL.md with gray-matter (not parseSkill which validates SPM format)
  const { data, content: body } = matter(skillMdRaw);

  // Default author to repo owner if not provided
  const author = options.author ?? ghSource.owner.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const outputDir = path.resolve(options.output ?? ".");

  let skillName: string;
  let serialized: string;

  if (isVercelFormat(data)) {
    // Convert Vercel → SPM
    log.info("Detected Vercel/external skill format — converting to SPM...");

    const parsed = convertVercelToSpm(data as any, body, {
      author,
      license: options.license,
      repository: `https://github.com/${ghSource.owner}/${ghSource.repo}`,
    });

    skillName = parsed.frontmatter.name;
    serialized = serializeSkill(parsed);

    // Validate the converted frontmatter
    const validation = validateSkillFrontmatter(parsed.frontmatter);
    if (!validation.valid) {
      log.warning("Converted skill has validation warnings:");
      for (const err of validation.errors) {
        log.warning(`  ${err}`);
      }
    }
  } else if (data.schema_version) {
    // Already SPM format — just copy
    log.info("Detected SPM format — copying as-is...");
    skillName = String(data.name || "unknown-skill");
    serialized = skillMdRaw;
  } else {
    // Unknown format — treat like Vercel (best effort)
    log.info("Unknown format — attempting conversion...");
    const vercelData = {
      name: String(data.name || path.basename(ghSource.path || ghSource.repo)),
      description: String(data.description || "TODO: add description"),
      ...data,
    };
    const parsed = convertVercelToSpm(vercelData as any, body, {
      author,
      license: options.license,
      repository: `https://github.com/${ghSource.owner}/${ghSource.repo}`,
    });

    skillName = parsed.frontmatter.name;
    serialized = serializeSkill(parsed);
  }

  // Write output
  const skillDir = path.join(outputDir, skillName);
  try {
    await fs.access(skillDir);
    exitError(`Directory already exists: ${skillDir}/`);
  } catch {
    // Does not exist — good
  }

  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), serialized, "utf-8");

  // Write auxiliary files (scripts, references, etc.)
  let auxCount = 0;
  for (const [filePath, content] of files) {
    if (filePath === "SKILL.md") continue;
    const fullPath = path.join(skillDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    auxCount++;
  }

  log.success(`Converted ${skillName}/ (SKILL.md${auxCount > 0 ? ` + ${auxCount} file(s)` : ""})`);

  note(
    `1. Review and edit SKILL.md (description, trigger, tags)\n2. spm validate ./${skillName}\n3. spm publish ./${skillName}`,
    "Next steps",
  );
}

// --- Main command ---

export async function convertCommand(
  source: string,
  options: ConvertOptions,
): Promise<void> {
  // GitHub source: convert from remote
  if (isGitHubSource(source)) {
    // Check if it's actually a local path that exists
    try {
      await fs.access(path.resolve(source));
      // Local path exists — fall through to local conversion
    } catch {
      // Not a local path — treat as GitHub
      await convertFromGitHub(source, options);
      return;
    }
  }

  // Local conversion (existing logic)
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

  const sp = spinner();
  sp.start("Converting...");

  const created: string[] = [];
  for (const file of files) {
    const name = await convertFile(file, meta, outputDir);
    if (name) {
      created.push(name);
    }
  }

  if (created.length === 0) {
    sp.stop("No skills created.");
    return;
  }

  sp.stop(`Converted ${created.length} file(s)`);

  for (const name of created) {
    log.success(`${name}/`);
  }

  note(
    `1. Edit SKILL.md frontmatter in each directory (description, trigger, tags)\n2. spm validate ./${created[0]}\n3. spm add ./${created[0]}`,
    "Next steps",
  );
}
