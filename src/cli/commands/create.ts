import fs from "node:fs/promises";
import path from "node:path";
import type { SkillManifest } from "../../types/index.js";
import { log, note, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "create",
  description: "Create a new skill scaffold",
  group: "system",
  args: [{ name: "name", required: true }],
  handler: createCommand,
};

function buildManifest(name: string): SkillManifest {
  return {
    schema_version: 1,
    name,
    version: "1.0.0",
    language: "en",
    description: `TODO: describe what ${name} does`,
    trigger: {
      description: `TODO: describe when to use ${name}`,
      tags: [name],
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
    author: "TODO",
    license: "MIT",
  };
}

// Template follows Claude prompting best practices:
// https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
//
// Key principles applied:
// - Give Claude a role (focuses behavior and tone)
// - Be clear and direct (specific instructions, not vague)
// - Add context with motivation (WHY behind each instruction helps Claude generalize)
// - Use XML tags for structure (unambiguous parsing of complex prompts)
// - Use examples effectively (3-5 diverse examples covering edge cases)
// - Tell what to do, not what not to do (positive framing)
// - Control output format explicitly (specify structure before examples)
// - Ask Claude to self-check (verification at the end)
const SKILL_MD_TEMPLATE = (name: string) => `<role>
TODO: one-sentence role definition that sets expertise and tone.
E.g., "You are an expert Python developer specializing in data pipelines."
</role>

# ${name}

<context>
TODO: explain why this skill exists — what problem it solves and what the user is trying to achieve.
Motivation helps the model make better decisions in ambiguous situations.
E.g., "This skill prevents data pipeline failures by enforcing schema validation at every stage."
</context>

<instructions>
TODO: step-by-step instructions the model follows literally.
Be specific: name exact libraries, APIs, file formats, conventions.
Use numbered lists for ordered steps, bullets for unordered.
For each step, include WHY it matters — this helps the model generalize to edge cases.

1. First, ... (because ...)
2. Then, ... (this ensures ...)
3. Finally, ... (so that ...)

## Output format

TODO: define the exact structure of the model's response.
Use a template the model can follow. This is the single most effective way to control output.

\`\`\`
## Section One
...
## Section Two
...
\`\`\`
</instructions>

<examples>
TODO: provide 3-5 diverse examples. Cover: typical request, edge case, ambiguous input.
Each example should be relevant to real usage and show the expected output format.

<example>
<input>User asks: "TODO: typical request"</input>
<output>
TODO: show the model's complete response following the output format above.
</output>
</example>

<example>
<input>User asks: "TODO: edge case or unusual input"</input>
<output>
TODO: show how the model handles this gracefully.
</output>
</example>

<example>
<input>User asks: "TODO: ambiguous request requiring clarification"</input>
<output>
TODO: show how the model asks targeted questions or states assumptions explicitly.
</output>
</example>
</examples>

<guidelines>
TODO: cross-cutting principles that apply to all instructions above.
Use positive framing — describe what TO do, not what NOT to do.
Include motivation (WHY) so the model can generalize beyond the literal rule.

- Always ... (because ... / this prevents ...)
- Prefer ... over ... (because ... / this ensures ...)
</guidelines>

<verification>
Before completing, verify:
- [ ] Output follows the format defined in instructions
- [ ] All edge cases from examples are handled
- [ ] No security permissions are used beyond what is declared in skill.json
</verification>
`;

export async function createCommand(name: string): Promise<void> {
  const dir = path.resolve(name);

  try {
    await fs.access(dir);
    exitError(`Directory "${name}" already exists.`);
  } catch {
    // Directory doesn't exist — good
  }

  await fs.mkdir(dir, { recursive: true });

  const manifest = buildManifest(name);
  await fs.writeFile(
    path.join(dir, "skill.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    SKILL_MD_TEMPLATE(name),
    "utf-8",
  );

  log.success(`Created skill scaffold: ${dir}/`);
  note(
    `skill.json — manifest (edit name, trigger, permissions)\nSKILL.md   — instructions for the model\n\nNext steps:\n  1. Edit skill.json — set author, description, trigger, tags\n  2. Edit SKILL.md — write model instructions\n     Prompting guide: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices\n  3. spm validate ./${name}\n  4. spm link ./${name}`,
    "Scaffold contents",
  );
}
