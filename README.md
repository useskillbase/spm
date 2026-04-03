<p align="center">
  <h1 align="center">Skillbase / spm</h1>
  <p align="center">Skills Package Manager — install, share, and manage reusable AI skills across any MCP-compatible client.</p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@skillbase/spm"><img src="https://img.shields.io/npm/v/@skillbase/spm?color=blue" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@skillbase/spm"><img src="https://img.shields.io/npm/dm/@skillbase/spm" alt="npm downloads"></a>
  <a href="https://github.com/useskillbase/spm/blob/main/LICENSE"><img src="https://img.shields.io/github/license/useskillbase/spm" alt="license"></a>
</p>

---

## What is spm?

spm is a package manager for AI skills. Skills are structured instructions — not code — that teach AI models how to perform specific tasks: code review, security audits, API design, prompt engineering, DeFi analysis, and more.

```bash
npm install -g @skillbase/spm
```

spm connects to your AI client via [MCP](https://modelcontextprotocol.io) (Model Context Protocol), giving your AI access to a registry of community-contributed skills that load on demand.

Unlike npm-based approaches that piggyback on `node_modules`, spm has its own registry, its own format, and works with any AI client — not just code editors.

## Quick start

```bash
# Install
npm install -g @skillbase/spm

# Initialize in your project
spm init

# Connect to your AI client
spm connect claude       # Claude Desktop / Claude Code
spm connect cursor       # Cursor
spm connect vscode       # VS Code (Copilot)
spm connect windsurf     # Windsurf
spm connect jetbrains    # Any JetBrains IDE

# Install a skill
spm add skillbase/arch-code-review

# Install a persona (a bundle of skills with a defined role)
spm persona add skillbase/sec
```

Once connected, your AI automatically discovers and loads skills when it encounters a matching task. No manual invocation needed.

## How it works

spm registers as an MCP server. Your AI client gets five tools:

| Tool | Purpose |
|------|---------|
| `skill_list` | Browse installed skills (compact index, not full content) |
| `skill_load` | Load a skill's full instructions into context |
| `skill_search` | Find skills by keyword, tag, or file pattern |
| `skill_install` | Install new skills from the registry |
| `skill_feedback` | Rate skill quality (feeds confidence scores) |

**Lazy loading** is key to the design. The AI sees a lightweight index of all installed skills. When it encounters a task that matches a skill's trigger, it loads just that skill's full instructions. This keeps context windows clean and lets you install dozens of skills without overhead.

```
User: "Review this pull request for architecture issues"
  ↓
AI sees skill_list → finds arch-code-review (trigger matches)
  ↓
AI calls skill_load("arch-code-review")
  ↓
Full review methodology loads into context
  ↓
AI performs structured code review
```

## What's inside a skill?

A skill is a directory. At its core is a `SKILL.md` file — structured Markdown with YAML frontmatter:

```markdown
---
name: arch-code-review
version: 1.0.3
description: "Architecture-aware code review"
tags: [code-review, architecture, solid, complexity]
triggers:
  - "code review"
  - "architecture review"
  - "pull request review"
---

# Code Review Methodology

## Evaluation criteria
- Coupling/cohesion at module and class level
- SOLID principle adherence
- Cyclomatic complexity hotspots
...
```

But a skill isn't limited to instructions. The directory can also contain auxiliary scripts, templates, example files, and any other resources the AI needs during execution. Think of `SKILL.md` as `package.json` — it's the entry point, but the whole directory is the package.

### Skill features

- **Semver versioning** — `skillbase/arch-code-review@1.0.3`
- **Dependencies** — skills can depend on other skills
- **Auxiliary files** — scripts, templates, reference data bundled alongside instructions
- **Triggers** — descriptions and file patterns that help the AI decide when to load
- **Tags** — for search and discovery
- **Confidence scores** — computed from real user feedback via `skill_feedback`

## Personas

A persona bundles multiple skills into a complete AI identity with a defined role, tone, and expertise area.

```bash
spm persona add skillbase/sec
```

This installs the **Security Auditor** persona with its dependencies: `smart-contract-audit`, `appsec`, and `web3-threat-modeling`. When activated, the AI assumes the persona's role and has access to all bundled skills.

Available personas:

| Persona | Role | Skills |
|---------|------|--------|
| `arch` | Software architect | system design, API contracts, code review |
| `py` | Python backend engineer | FastAPI, async, testing, MongoDB/PostgreSQL |
| `ts` | TypeScript fullstack dev | React/Next/Nuxt, Node, Tailwind, wagmi |
| `sol` | Solidity/EVM developer | Foundry, OpenZeppelin, gas optimization |
| `sec` | Security auditor | smart contract audit, AppSec, threat modeling |
| `trader` | DeFi/crypto trader | on-chain analysis, yield strategies, MEV |
| `growth` | Growth marketer | funnels, metrics, Web3 go-to-market |
| `prompt-engineer` | Prompt engineer | SKILL.md authoring, prompt best practices |
| `prompt-manager` | Prompt manager | skill demand research, quality review |

## Registry

The registry currently hosts 30+ skills across several domains:

**Development** — `python-backend`, `python-testing`, `db-mongodb`, `arch-code-review`, `arch-api-design`, `arch-system-design`

**Security** — `appsec`, `smart-contract-audit`, `web3-threat-modeling`, `prompt-injection-detector`, `jailbreak-scanner`, `prompt-safety-validator`

**DeFi & Trading** — `yield-analysis`, `leverage-calc`, `onchain-signals`, `mev-awareness`, `trade-journal`

**Growth & Strategy** — `defi-growth-strategy`, `growth-airdrop-design`, `web3-grant-writing`

**Meta** — `prompt-engineering-craft` (learn to write better prompts and skills)

Browse the full registry: [skillbase.space/explore](https://skillbase.space/explore)

## Publish your own skill

```bash
# Scaffold a new skill
spm create my-skill

# Edit SKILL.md with your instructions
# Add any auxiliary scripts or templates

# Publish to the registry
spm publish
```

Skills are free to publish and free to use. The registry is open.

## Supported clients

spm works with any client that supports MCP:

Claude Desktop, Claude Code, Cursor, VS Code (GitHub Copilot), Windsurf, Cline, Roo Code, JetBrains IDEs (all), Zed, Emacs, Neovim, and others.

```bash
# See all supported clients
spm connect --list
```

## Why not just use npm?

Some projects bundle AI skills inside npm packages. spm takes a different approach:

- **Own registry** — skills are first-class citizens, not a side-effect of npm install. Discovery, search, versioning, and confidence scores are built in.
- **Not tied to Node.js** — spm skills work with any AI client on any platform. You don't need a `node_modules` folder.
- **Lazy loading via MCP** — skills load into AI context on demand, not all at once. This is critical when you have dozens of skills.
- **Feedback loop** — `skill_feedback` lets users rate skills. Confidence scores surface the most effective skills.
- **Personas** — bundle skills into roles. npm has no concept of this.
- **Extensible format** — a skill can grow from pure instructions to include scripts, templates, and data without changing how it's installed or loaded.

## Security

All skills and personas in the public registry go through a security review before publication. Auxiliary files bundled with skills are scanned with antivirus and additional automated security tooling. spm uses token-scoped authorization for publishing — only verified authors can update their packages.

The `SKILL.md` format is plain Markdown with structured metadata — there's no `postinstall` script execution or hidden side effects.

## Contributing

We welcome skills, bug reports, feature requests, and documentation improvements.

- [Open an issue](https://github.com/useskillbase/spm/issues)
- [Start a discussion](https://github.com/useskillbase/spm/discussions)
- [Publish a skill](https://skillbase.space/docs/creating-skills)

## Links

- [skillbase.space](https://skillbase.space) — spm homepage and registry
- [Skillbase Workspace](https://workspace.skillbase.space) — managed AI teams in the cloud (Teams as a Service)
- [Documentation](https://skillbase.space/docs/getting-started)
- [npm](https://www.npmjs.com/package/@skillbase/spm)

## License

MIT — see [LICENSE](LICENSE).
