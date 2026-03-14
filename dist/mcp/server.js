import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSkillIndex, findSkill } from "../core/registry.js";
import { loadSkill } from "../core/loader.js";
import { readConfig } from "../core/config.js";
const require = createRequire(import.meta.url);
const pkg = require("../../package.json");
import { addFeedback, getStatsForSkill } from "../core/feedback.js";
import { createRegistryClients, getClientForSkill, } from "../core/registry-client.js";
import { listPersonas, readPersona, getActivePersona, buildCharacterInstructions, } from "../core/persona.js";
export async function createServer() {
    const config = await readConfig();
    // Build compact skill index for instructions
    // Format: name|tokens|trigger|tags|patterns (one line per skill)
    const index = await getSkillIndex();
    const skillLines = index.skills.map((s) => {
        let line = `${s.name}|${s.tokens_estimate}t|${s.trigger}|${s.tags.join(",")}`;
        if (s.file_patterns)
            line += `|${s.file_patterns.join(",")}`;
        return line;
    });
    const skillIndex = skillLines.length > 0
        ? `\n\nInstalled skills (name|tokens|trigger|tags|file_patterns):\n${skillLines.join("\n")}`
        : "";
    // Build persona section for instructions
    const personas = await listPersonas();
    const personaIndex = personas.length > 0
        ? `\n\nAvailable personas: ${personas.map((p) => `@${p.name}`).join(", ")}\nWhen the user mentions a persona with @ (e.g. "@${personas[0]?.name}"), immediately call persona_load with that name. You can also use persona_load directly.`
        : "";
    // If active persona is set, inject its character into instructions
    let activePersonaInstructions = "";
    const activePersona = await getActivePersona();
    if (activePersona) {
        activePersonaInstructions =
            "\n\n" +
                buildCharacterInstructions(activePersona.character, activePersona.settings);
    }
    const server = new McpServer({
        name: "skillbase",
        version: pkg.version,
    }, {
        capabilities: {
            tools: {},
        },
        instructions: [
            "Skillbase — AI skill manager.",
            "When a user's task matches a skill's trigger description, load it with skill_load before starting work.",
            "Use skill_search to find skills by keyword, tag, or file pattern.",
            "Use skill_context to check which skills are already loaded and token budget.",
            "Higher priority skills take precedence when multiple skills match.",
            "After completing a task with a skill, call skill_feedback with the result.",
            "If a skill's confidence is low (<0.5), treat it as guidance rather than strict instructions.",
            "If no local skill matches, use skill_search with scope='remote' to check remote registries.",
            "If a good remote match is found, suggest it to the user and use skill_install upon approval.",
        ].join(" ") + skillIndex + personaIndex + activePersonaInstructions,
    });
    const loadedSkills = [];
    registerTools(server, config, loadedSkills);
    return server;
}
function registerTools(server, config, loadedSkills) {
    if (config.tools.skill_list) {
        registerSkillList(server);
    }
    if (config.tools.skill_load) {
        registerSkillLoad(server, loadedSkills);
    }
    if (config.tools.skill_context) {
        registerSkillContext(server, loadedSkills);
    }
    if (config.tools.skill_search) {
        registerSkillSearch(server, config);
    }
    if (config.tools.skill_feedback && config.feedback.enabled) {
        registerSkillFeedback(server);
    }
    if (config.tools.skill_install) {
        registerSkillInstall(server, config);
    }
    if (config.tools.persona_list) {
        registerPersonaList(server);
    }
    if (config.tools.persona_load) {
        registerPersonaLoad(server);
    }
}
function registerSkillList(server) {
    server.tool("skill_list", "Returns a compact list of all installed skills with their trigger descriptions, tags, and token estimates. Use this to discover which skills are available before loading one.", {}, async () => {
        const index = await getSkillIndex();
        const skills = index.skills.map((s) => ({
            name: s.name,
            version: s.v,
            trigger: s.trigger,
            tags: s.tags,
            file_patterns: s.file_patterns,
            priority: s.priority,
            tokens_estimate: s.tokens_estimate,
        }));
        return {
            content: [
                { type: "text", text: JSON.stringify({ skills }, null, 2) },
            ],
        };
    });
}
function registerSkillLoad(server, loadedSkills) {
    server.tool("skill_load", "Loads a skill's full instructions into context. Pass the skill name (e.g. 'docx'). Use compact=true when context budget is tight. Returns content, permissions, works_with composition hints, and confidence score.", {
        name: z.string().describe("Skill name, e.g. 'docx'"),
        compact: z
            .boolean()
            .optional()
            .default(false)
            .describe("Load compact version if available"),
    }, async ({ name, compact }) => {
        const index = await getSkillIndex();
        const entry = findSkill(index, name);
        if (!entry) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Skill "${name}" not found. Use skill_list to see available skills.`,
                    },
                ],
                isError: true,
            };
        }
        try {
            const loaded = await loadSkill(entry, compact);
            const stats = await getStatsForSkill(name);
            loadedSkills.push({
                name: loaded.name,
                version: loaded.version,
                tokens: loaded.tokens_estimate,
            });
            const metadata = {
                name: loaded.name,
                version: loaded.version,
                permissions: loaded.permissions,
                tokens_estimate: loaded.tokens_estimate,
                confidence: stats?.confidence ?? null,
                works_with: loaded.works_with ?? [],
            };
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ metadata }, null, 2),
                    },
                    {
                        type: "text",
                        text: loaded.content,
                    },
                ],
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to load skill "${name}": ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });
}
function registerSkillContext(server, loadedSkills) {
    server.tool("skill_context", "Returns information about the current skill session: which skills are loaded, how many tokens are used, and available token budget.", {}, async () => {
        const index = await getSkillIndex();
        const totalAvailable = index.skills.reduce((sum, s) => sum + s.tokens_estimate, 0);
        const tokensUsed = loadedSkills.reduce((sum, s) => sum + s.tokens, 0);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        loaded: loadedSkills,
                        tokens_used: tokensUsed,
                        tokens_available: totalAvailable - tokensUsed,
                        total_skills: index.skills.length,
                    }, null, 2),
                },
            ],
        };
    });
}
function registerSkillSearch(server, config) {
    server.tool("skill_search", "Search for skills by query. Matches against skill names, tags, trigger descriptions, and file patterns. Use scope='remote' to search remote registries, scope='all' for both local and remote. Returns confidence score when available.", {
        query: z
            .string()
            .describe("Search query (keyword, tag, or file pattern like '*.docx')"),
        scope: z
            .enum(["local", "remote", "all"])
            .optional()
            .default("local")
            .describe("Search scope: local (installed), remote (registries), or all"),
    }, async ({ query, scope }) => {
        const results = {};
        // Local search
        if (scope === "local" || scope === "all") {
            const index = await getSkillIndex();
            const q = query.toLowerCase();
            const scored = index.skills.map((skill) => {
                let score = 0;
                if (skill.name.toLowerCase().includes(q))
                    score += 10;
                if (skill.tags.some((t) => t === q))
                    score += 8;
                if (skill.tags.some((t) => t.includes(q)))
                    score += 4;
                if (skill.trigger.toLowerCase().includes(q))
                    score += 3;
                if (skill.file_patterns?.some((p) => p.includes(q)))
                    score += 6;
                return { skill, score };
            });
            const matches = scored
                .filter((s) => s.score > 0)
                .sort((a, b) => b.score - a.score);
            results.local = await Promise.all(matches.map(async (s) => {
                const stats = await getStatsForSkill(s.skill.name);
                return {
                    name: s.skill.name,
                    score: s.score,
                    trigger: s.skill.trigger,
                    tags: s.skill.tags,
                    tokens_estimate: s.skill.tokens_estimate,
                    confidence: stats?.confidence ?? null,
                };
            }));
        }
        // Remote search
        if ((scope === "remote" || scope === "all") &&
            config.search.remote_enabled) {
            const clients = createRegistryClients(config);
            const remoteResults = [];
            for (const [registryName, client] of clients) {
                try {
                    const searchResult = await client.search(query);
                    for (const s of searchResult.skills) {
                        remoteResults.push({
                            name: s.name,
                            version: s.version,
                            trigger: s.trigger.description,
                            author: s.author,
                            installs: s.installs,
                            confidence: s.confidence,
                            registry: registryName,
                        });
                    }
                }
                catch {
                    // Registry unavailable, skip silently
                }
            }
            results.remote = remoteResults;
        }
        const hasResults = (results.local && results.local.length > 0) ||
            (results.remote && results.remote.length > 0);
        return {
            content: [
                {
                    type: "text",
                    text: hasResults
                        ? JSON.stringify(results, null, 2)
                        : `No skills found matching "${query}".`,
                },
            ],
        };
    });
}
function registerSkillFeedback(server) {
    server.tool("skill_feedback", "Records feedback after using a skill. Call this after completing a task with a loaded skill. Result: success (task completed), partial (partially helpful), failure (skill didn't help), false_trigger (wrong skill for the task).", {
        name: z.string().describe("Skill name, e.g. 'docx'"),
        result: z
            .enum(["success", "partial", "failure", "false_trigger"])
            .describe("Outcome of using the skill"),
        comment: z
            .string()
            .optional()
            .describe("Optional details about the result"),
    }, async ({ name, result, comment }) => {
        const index = await getSkillIndex();
        const entry = findSkill(index, name);
        if (!entry) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Skill "${name}" not found. Cannot record feedback.`,
                    },
                ],
                isError: true,
            };
        }
        await addFeedback(name, entry.v, result, "automatic", {
            comment: comment ?? undefined,
        });
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ recorded: true, skill: name, result }),
                },
            ],
        };
    });
}
function registerSkillInstall(server, config) {
    server.tool("skill_install", "Installs a skill from a remote registry. REQUIRES user confirmation before calling. Suggest the skill to the user first, then call this only after they approve. Pass the skill reference as 'author/name' (e.g. 'community/code-reviewer').", {
        name: z
            .string()
            .describe("Skill reference to install, e.g. 'community/code-reviewer'"),
        version: z
            .string()
            .optional()
            .describe("Specific version to install (latest if omitted)"),
    }, async ({ name, version }) => {
        const client = getClientForSkill(config, name);
        if (!client) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No registry configured for "${name}". The user needs to add a registry first.`,
                    },
                ],
                isError: true,
            };
        }
        try {
            // Parse author/name reference
            const slashIdx = name.indexOf("/");
            if (slashIdx === -1) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Invalid skill reference: ${name}. Expected author/name.`,
                        },
                    ],
                    isError: true,
                };
            }
            const author = name.slice(0, slashIdx);
            const skillName = name.slice(slashIdx + 1);
            // Fetch and install
            const data = await client.getContent(author, skillName, version);
            // For MCP, we write files directly
            const fs = await import("node:fs/promises");
            const path = await import("node:path");
            const { getGlobalSkillsDir, getInstalledDir } = await import("../core/paths.js");
            const { writeIndex } = await import("../core/indexer.js");
            const { writeLock } = await import("../core/lock.js");
            const manifest = data.manifest;
            const skillsDir = getGlobalSkillsDir();
            const installedDir = getInstalledDir(skillsDir);
            const dest = path.join(installedDir, author, skillName);
            await fs.rm(dest, { recursive: true, force: true });
            await fs.mkdir(dest, { recursive: true });
            await fs.writeFile(path.join(dest, "skill.json"), JSON.stringify(manifest, null, 2), "utf-8");
            await fs.writeFile(path.join(dest, manifest.entry), data.content, "utf-8");
            await writeIndex(skillsDir);
            await writeLock(skillsDir);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            installed: true,
                            name: data.name,
                            version: data.version,
                            tokens_estimate: data.tokens_estimate,
                        }),
                    },
                ],
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text",
                        text: `Failed to install "${name}": ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });
}
function registerPersonaList(server) {
    server.tool("persona_list", "Lists all available personas. A persona defines the AI's character, tone, and associated skills.", {}, async () => {
        const personas = await listPersonas();
        if (personas.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No personas installed. Use `spm persona install <path>` to install a .person.json file.",
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ personas }, null, 2),
                },
            ],
        };
    });
}
function registerPersonaLoad(server) {
    server.tool("persona_load", "Activates a persona by name. Returns the persona's character instructions for you to adopt. Skills from the persona's dependencies are already installed and available via skill_load — do NOT load them all at once, use them as needed.", {
        name: z.string().describe("Persona name, e.g. 'code-reviewer'"),
    }, async ({ name }) => {
        const persona = await readPersona(name);
        if (!persona) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Persona "${name}" not found. Use persona_list to see available personas.`,
                    },
                ],
                isError: true,
            };
        }
        const characterText = buildCharacterInstructions(persona.character, persona.settings);
        const metadata = {
            name: persona.name,
            version: persona.version,
            description: persona.description,
            skills: persona.skills
                ? Object.keys(persona.skills)
                : [],
            settings: persona.settings ?? null,
            settings_note: persona.settings
                ? "Settings like temperature may not be applied if the client does not support runtime changes. Character instructions compensate via prompt."
                : undefined,
        };
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ metadata }, null, 2),
                },
                {
                    type: "text",
                    text: characterText,
                },
            ],
        };
    });
}
//# sourceMappingURL=server.js.map