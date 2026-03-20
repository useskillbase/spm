import fs from "node:fs/promises";
import path from "node:path";
import { log, note, exitError } from "../ui.js";
import type { CommandDef } from "../command.js";

export const command: CommandDef = {
  name: "create",
  description: "Create a new skill scaffold",
  group: "system",
  args: [{ name: "name", required: true }],
  handler: createCommand,
};

// Template follows Claude prompting best practices:
// https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
const SKILL_MD_TEMPLATE = (name: string) => `---
name: ${name}
version: 1.0.0
author: TODO
license: MIT
description: "TODO: describe what ${name} does"
language: en

trigger:
  description: "TODO: describe when to use ${name}"
  tags: [${name}]
  priority: 50

security:
  permissions: []
---

# ${name}

<context>
TODO: explain what this skill does — what problem it solves, what expertise it brings,
and what the user is trying to achieve. This sets the scope for all instructions below.
E.g., "This skill enforces schema validation in Python data pipelines to prevent failures at every stage.
It brings expertise in pandas, pydantic, and data contracts."
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
- [ ] No undeclared permissions are used
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

  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    SKILL_MD_TEMPLATE(name),
    "utf-8",
  );

  log.success(`Created skill scaffold: ${dir}/`);
  note(
    `SKILL.md — metadata (frontmatter) + instructions (body)\n\nNext steps:\n  1. Edit SKILL.md — set author, description, trigger, tags in frontmatter\n  2. Write model instructions in the body\n     Prompting guide: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices\n  3. spm validate ./${name}\n  4. spm link ./${name}`,
    "Scaffold contents",
  );
}
