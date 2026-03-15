# Skillbase (spm)

[![npm version](https://img.shields.io/npm/v/@skillbase/spm)](https://www.npmjs.com/package/@skillbase/spm)
[![license](https://img.shields.io/npm/l/@skillbase/spm)](https://github.com/useskillbase/spm/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/@skillbase/spm)](https://www.npmjs.com/package/@skillbase/spm)

**AI skills manager** — install, publish, and deploy reusable prompts, personas, and MCP tools across 14 AI clients.

Think **npm for AI capabilities**: versioned packages of prompts, instructions, and tools that any LLM can use.

```bash
npm install -g @skillbase/spm
```

## Why Skillbase?

- **One command to connect** — `spm connect claude` wires up MCP for Claude, Cursor, VS Code, Zed, and 10 more clients
- **Portable skills** — write once, use everywhere. Skills are model-agnostic packages with semver, dependencies, and a registry
- **Personas** — define AI agent personalities with traits, model settings, and skill dependencies in a single `.person.json`
- **Deploy targets** — export and deploy personas to external platforms (OpenClaw, more coming)
- **Built-in MCP server** — skills auto-load into your AI client via Model Context Protocol

## Supported AI Clients

| Client | Connect command |
|---|---|
| Claude Desktop | `spm connect claude` |
| Claude Code | `spm connect claude-code` |
| Cursor | `spm connect cursor` |
| VS Code (Copilot) | `spm connect vscode` |
| Windsurf | `spm connect windsurf` |
| Zed | `spm connect zed` |
| JetBrains IDEs | `spm connect jetbrains` |
| Cline | `spm connect cline` |
| Roo Code | `spm connect roo-code` |
| Continue | `spm connect continue` |
| Amazon Q Developer | `spm connect amazonq` |
| Gemini CLI | `spm connect gemini` |
| OpenCode | `spm connect opencode` |
| OpenClaw | `spm connect openclaw` |

## Quick Start

```bash
# Initialize skills directory
spm init

# Search for skills
spm search "code review"

# Install a skill
spm add author/skill-name

# Connect to your AI client
spm connect claude
```

## What is a Skill?

A skill is a portable, versioned package containing prompts, tools, or instructions that any AI model can use.

```
my-skill/
├── skill.json    # Manifest (name, version, triggers, dependencies)
└── SKILL.md      # Main prompt / instructions
```

## Personas

Define AI agent personalities with character traits, model settings, and skill dependencies:

```bash
# Create a persona
spm persona create my-agent

# Activate (auto-installs missing skills)
spm persona activate my-agent

# Export to external platform
spm persona export my-agent -f openclaw

# Deploy
spm persona deploy my-agent -t openclaw
```

## Commands

### Manage Skills

| Command | Description |
|---|---|
| `spm add <ref>` | Install a skill |
| `spm install` | Install all dependencies from skill.json |
| `spm remove <ref>` | Remove a skill |
| `spm create <name>` | Scaffold a new skill |
| `spm link <path>` | Symlink a local skill for development |
| `spm convert <file>` | Convert .md/.txt prompts into skills |
| `spm list` | List installed skills |
| `spm info <name>` | Show skill details |
| `spm validate` | Validate a skill directory |

### Personas

| Command | Description |
|---|---|
| `spm persona create` | Create a new persona |
| `spm persona list` | List installed personas |
| `spm persona activate` | Activate persona (auto-installs skills) |
| `spm persona deactivate` | Deactivate current persona |
| `spm persona export` | Export to target platform format |
| `spm persona deploy` | Deploy to target platform |
| `spm persona import` | Import from external platform |

### Registry

| Command | Description |
|---|---|
| `spm search <query>` | Search local and remote registries |
| `spm publish <path>` | Publish to registry |
| `spm update <path>` | Update a published skill |
| `spm login` | Authenticate (GitHub OAuth) |
| `spm rate <name>` | Rate a skill (1-5) |
| `spm registry add <url>` | Add a remote registry |

### System

| Command | Description |
|---|---|
| `spm connect <client>` | Connect MCP server to AI client |
| `spm disconnect <client>` | Disconnect from AI client |
| `spm serve` | Start MCP server (stdio) |
| `spm init` | Initialize skills directory |
| `spm reindex` | Rebuild skill index |

## MCP Server

Skillbase includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that exposes installed skills as tools to any MCP-compatible AI client:

```bash
spm serve --stdio
```

**MCP tools provided:** `skill_list`, `skill_load`, `skill_search`, `skill_context`, `skill_feedback`, `skill_install`, `persona_list`, `persona_load`

## Registries

Skills can be published to self-hosted registries or installed directly from GitHub:

```bash
# Install from registry
spm add author/skill-name

# Install from GitHub
spm add github:author/repo

# Add a custom registry
spm registry add https://registry.example.com

# Publish
spm publish ./my-skill
```

## Requirements

- Node.js >= 20.0.0

## License

[MIT](LICENSE)
