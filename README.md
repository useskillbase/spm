# Skillbase

Package manager for AI skills — discover, install, and publish reusable prompts and tools.

```
npm install -g @skillbase/spm
```

## Quick start

```bash
# Initialize skills directory
spm init

# Search for skills
spm search "code review"

# Install a skill
spm install author/skill-name

# Connect to your AI client
spm connect claude
```

## What is a skill?

A skill is a portable, versioned package containing prompts, tools, or instructions that any AI model can use. Think npm packages, but for AI capabilities.

```
my-skill/
├── skill.json    # Manifest (name, version, dependencies)
└── SKILL.md      # Main prompt
```

## Commands

| Command                | Description                           |
| ---------------------- | ------------------------------------- |
| `spm init`             | Initialize skills directory           |
| `spm create <name>`    | Scaffold a new skill                  |
| `spm install [source]` | Install skills (supports GitHub URLs) |
| `spm publish <path>`   | Publish to registry                   |
| `spm search <query>`   | Search local and remote registries    |
| `spm connect <client>` | Connect to AI client (Claude, Zed)    |
| `spm convert <file>`   | Convert .md/.txt prompts to skills    |
| `spm list`             | List installed skills                 |
| `spm info <name>`      | Show skill details                    |
| `spm rate <name>`      | Rate a skill                          |

## MCP Server

Skillbase includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server for direct AI integration:

```bash
spm serve --stdio
```

## Registries

Skills can be published to self-hosted registries or installed directly from GitHub:

```bash
# Add a registry
spm registry add https://registry.example.com

# Install from GitHub
spm install github:author/repo

# Publish to a specific registry
spm publish ./my-skill --registry myregistry
```

## Authentication

```bash
# Login via GitHub OAuth
spm login --github

# Or with a specific registry
spm login https://registry.example.com
```

## Requirements

- Node.js >= 20.0.0

## License

[MIT](LICENSE)
