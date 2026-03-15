# Changelog

## [Unreleased]

## [0.4.1] - 2026-03-15

### Changed

- **Expanded npm metadata** — description updated to highlight 14 AI clients, personas, and MCP; keywords expanded from 10 to 24 (added client names, `mcp-server`, `ai-agents`, `prompt-engineering`); structured `repository` and `bugs` fields for proper npmjs sidebar links
- **README rewritten** — added badges (version, license, downloads), "Why Skillbase?" value prop section, full table of 14 supported AI clients, organized command reference by category (Skills, Personas, Registry, System), MCP tools listing

## [0.4.0] - 2026-03-15

### Added

- **Deploy target system** — extensible `DeployTarget` interface (`src/targets/`) for exporting and deploying personas to external platforms
- **OpenClaw integration** — first deploy target:
  - `spm connect openclaw` (alias: `oc`) — register SPM as MCP server in mcporter.json
  - `spm persona export <name> -f openclaw` — generate SOUL.md, AGENTS.md, and mcporter.json for an OpenClaw workspace
  - `spm persona deploy <name> -t openclaw` — full deployment: create workspace, update `openclaw.json` (agents + bindings), Docker volume fragment
  - `spm persona import --from openclaw` — reverse import: parse SOUL.md back into `.person.json`
- **Channel binding** — `--bind-channel` / `--bind-account` flags on deploy for routing agents to messaging channels (Telegram, WhatsApp, etc.)
- **Temperature → thinkingLevel mapping** — persona temperature settings are mapped to OpenClaw thinkingLevel recommendations (≤0.3→high, ≤0.5→medium, ≤0.7→low, ≥0.8→minimal)

## [0.3.0] - 2026-03-15

### Added

- **11 new AI client integrations** — `spm connect` now supports 13 clients total:
  - Claude Desktop, Claude Code, Zed, Cursor, VS Code (Copilot), Windsurf, JetBrains IDEs, Cline, Roo Code, Continue, Amazon Q Developer, Gemini CLI, OpenCode
- **Modular client architecture** — each AI client is a self-contained module in `src/clients/` with platform-aware config paths
- **Client aliases** — `jb` → jetbrains, `code` → vscode, `roo` → roo-code
- **Arbitrary-depth JSON path support** — handles VS Code's nested `mcp.servers.spm` path and client-specific extra fields (Cline/Roo: `disabled`, `alwaysAllow`; VS Code: `type: "stdio"`)

## [0.2.3] - 2026-03-15

- **Stronger MCP instructions** — added MANDATORY PRE-RESPONSE CHECK that forces the model to scan and load matching skills/personas before generating any response

## [0.2.1] - 2026-03-14

### Fixed

- **`spm <command> --help` stack overflow** — custom `formatHelp` called itself recursively for commands without subcommands; now falls back to the original `Help.prototype.formatHelp`

## [0.2.0] - 2026-03-14

### Added

- **Persona system** — `.person.json` format for defining AI agent personalities with character traits (role, tone, guidelines, instructions), model settings, and skill dependencies
- **MCP tools**: `persona_list`, `persona_load` — list available personas and activate them in chat
- **Persona storage**: `~/.skills/personas/` (global) and `.skills/personas/` (project-level, overrides global)
- **Active persona injection** — active persona's character instructions are injected into MCP server instructions at startup
- **JSON Schema validation** for `.person.json` manifests
- **`spm link <path>`** — symlink a local skill directory for development (like `yarn link`)
- **`spm add <ref> --for [persona]`** — add skill reference to persona file(s) without installing
- **`spm remove <ref> --from [persona]`** — remove skill reference from persona file(s)
- **`spm persona activate <name>`** — activate a persona and auto-install any missing skills from its dependencies
- **`spm persona remove <name>`** — remove a persona from global installation
- **CLI commands**: `spm persona create/list/activate/deactivate/info/remove/validate` — full persona lifecycle

### Changed

- **CLI command semantics redesigned** following yarn/pnpm conventions:
  - `spm install skill <ref>` → **`spm add <ref>`**
  - `spm install` (no args) → installs all dependencies from `skill.json`
  - `spm uninstall`/`spm remove` → unified skill removal
  - `spm create <name>` → simplified scaffold (removed `--scope`)
  - `spm persona use` → **`spm persona activate`**
  - `spm persona off` → **`spm persona deactivate`**
- **Extensible command architecture** — self-contained command modules with declarative `CommandDef` exports and auto-discovery loader
- **Brand-themed CLI output** — custom logger with Skillbase brand colors, grouped help output by category

## [0.1.x] - 2026-03-13 – 2026-03-14

### 0.1.0 — Initial release

- **Core engine**: skill indexer, loader, registry with global (`~/.skills/`) and project-level (`.skills/`) support
- **MCP server** (stdio) with tools: `skill_list`, `skill_load`, `skill_context`, `skill_search`, `skill_feedback`, `skill_install`
- **CLI** (`spm`): full command set — init, create, validate, install, uninstall, list, info, reindex, search, publish, update, login, rate, stats, convert, connect, disconnect, serve
- **Feedback & confidence system**, remote registry support, GitHub integration, S3 storage
- **Dependency resolution** with semver ranges, cycle detection, transitive auto-install
- **`spm convert`**: convert `.md`/`.txt`/`.prompt` files into skill scaffolds
- JSON Schema validation, TypeScript throughout, 150 tests

### 0.1.1 – 0.1.4 — Patches

- JSONC-safe `connect`/`disconnect` (preserves comments and formatting)
- Embedded skill index in MCP instructions for instant discovery
- Dynamic CLI version from `package.json`, branding cleanup
- GitHub Actions publish workflow
