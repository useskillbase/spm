import fs from "node:fs/promises";
import path from "node:path";
function buildManifest(name, scope) {
    return {
        schema_version: 1,
        name: `@${scope}/${name}`,
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
const SKILL_MD_TEMPLATE = (name) => `<role>
TODO: one-sentence role definition. E.g., "You are an expert Python developer specializing in data pipelines."
</role>

# ${name}

<context>
TODO: explain why this skill exists — what problem it solves and what the user is trying to achieve.
This helps the model understand motivation and make better decisions in ambiguous situations.
</context>

<instructions>
TODO: core step-by-step instructions. Be specific: name exact libraries, APIs, file formats.
The model follows these literally. Use numbered lists for ordered steps, bullets for unordered.

1. First, ...
2. Then, ...
3. Finally, ...
</instructions>

<examples>
<example>
<input>User asks: "TODO: describe a typical request"</input>
<output>
TODO: show what the model should do — code, commands, or response format.
</output>
</example>

<example>
<input>User asks: "TODO: describe an edge case"</input>
<output>
TODO: show how the model handles this edge case.
</output>
</example>
</examples>

<guidelines>
TODO: use positive framing — describe what TO do, not what NOT to do.
Include motivation (WHY) for each guideline so the model can generalize.

- Always validate inputs before processing (prevents silent data corruption)
- Use explicit error messages with fix suggestions (reduces user back-and-forth)
</guidelines>

<verification>
Before completing, verify:
- [ ] Output matches the expected format from examples
- [ ] All edge cases are handled
- [ ] No security permissions are used beyond what is declared in skill.json
</verification>
`;
export async function createCommand(name, options) {
    const scope = options.scope ?? "user";
    const dir = path.resolve(name);
    try {
        await fs.access(dir);
        console.error(`Error: directory "${name}" already exists.`);
        process.exit(1);
    }
    catch {
        // Directory doesn't exist — good
    }
    await fs.mkdir(dir, { recursive: true });
    const manifest = buildManifest(name, scope);
    await fs.writeFile(path.join(dir, "skill.json"), JSON.stringify(manifest, null, 2), "utf-8");
    await fs.writeFile(path.join(dir, "SKILL.md"), SKILL_MD_TEMPLATE(name), "utf-8");
    console.log(`Created skill scaffold: ${dir}/`);
    console.log(`  skill.json — manifest (edit name, trigger, permissions)`);
    console.log(`  SKILL.md   — instructions for the model`);
    console.log(`\nNext steps:`);
    console.log(`  1. Edit skill.json — set description, trigger, tags`);
    console.log(`  2. Edit SKILL.md — write model instructions`);
    console.log(`  3. skills validate ./${name}`);
    console.log(`  4. skills install ./${name}`);
}
//# sourceMappingURL=create.js.map