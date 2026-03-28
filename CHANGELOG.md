# Changelog

## [Unreleased]

## [0.6.3] - 2026-03-28

## [0.6.2] - 2026-03-28

## [0.6.1] - 2026-03-28

### Added

- **Supporting files listing in `skill_load`** — when a skill directory contains supporting files (scripts, configs, data files), `skill_load` now returns `files` (relative paths) and `install_path` (absolute directory path) in metadata, so the model knows what utilities are available and can access them via `skill_exec_read` / `skill_exec_bash`
- **MCP instructions for supporting files** — base instructions now explain to the model how to use `files` and `install_path` from skill metadata as trusted skill resources

## [0.6.0] - 2026-03-28

### Added

- **`spm publish --private`** — publish packages with private visibility; private packages are only visible to their author and cannot be found, viewed, or installed by other users

### Changed

- **Publishing rules enforced** — maximum package size of 50 KB; binary files and obfuscated code are rejected; versions are immutable (cannot be overwritten); new versions must be strictly greater than the latest (semver)

## [0.5.1] - 2026-03-26

## [0.5.0] - 2026-03-20

### Added

- **`skillbase.json` workspace manifest** — new project manifest format with `schema_version`, `skills`, `personas`, `registry` fields
- **Unified `SKILL.md` format** — YAML frontmatter + markdown body as the only skill format; full AJV schema validation
- **`SOUL.md` persona format** — YAML frontmatter with `skillbase:` namespace (trigger, skills, constraints, avatar, voice, animation, MCP servers, settings) + free-form markdown body
- **Inline package management from website** — install, update, and remove skills directly from the sidebar without CLI
  - `GET /status` returns installed packages map (skills + personas with versions) and `has_token` on connections
  - `POST /action` starts install/update/remove tasks with async execution and step callbacks
  - `GET /action/:id` polls task progress (status, step label, error)
  - `POST /shutdown` graceful server stop from browser Disconnect button
  - Max 3 concurrent tasks, 5-minute task cleanup
- **`spm://start` protocol action** — starts status server from browser Connect button without OS confirmation dialog
- **`Sec-Fetch-Site` security** — mutation endpoints (`/action`, `/shutdown`) validate browser `Sec-Fetch-Site` header to block cross-origin attacks from unauthorized websites
- **`spm://` protocol handler** — custom URL scheme for one-click install, activate, connect, and start from the web
  - `spm protocol-handle <url>` — parses and dispatches protocol URLs with rate limiting and nonce verification
  - `spm protocol register` / `unregister` — OS-specific protocol registration (macOS via osacompile applet, Linux, Windows)
  - Auto-registers on `npm install -g`
- **Remote OpenClaw connection** — `spm connect openclaw --remote <url>`, connection management, secure token storage via OS keychain
- **Local status server** — `spm status-server start/stop/status`, HTTP on `127.0.0.1:57321` with CORS, auto-daemon on connect
- **`spm migrate` command** — `spm migrate detect` / `spm migrate run` for automatic v1/v2→v3 format migration

### Changed

- **Removed legacy `skill.json` support** — all CLI commands (`publish`, `validate`, `link`, `info`, `convert`) now read SKILL.md exclusively; indexer, loader, lock builder no longer fall back to skill.json
- **`spm convert` outputs SKILL.md with frontmatter** — no longer creates separate skill.json; uses `schema_version: 3`
- **`spm publish` reads SKILL.md** — sends raw SKILL.md content as separate FormData field; discovers skill dirs by SKILL.md presence
- **`spm create` template updated** — `<role>` section replaced with `<context>` explaining what the skill does
- **macOS protocol handler** — uses compiled AppleScript applet (osacompile) instead of shell script, correctly receives URLs via Apple Events
- **`spm connect` auto-starts status server** — `ensureStatusServer()` called after client connection

### Fixed

- **`writeConfig` crash on fresh install** — now creates `~/.spm/` directory before writing config.json
- **`spm login` scope corruption** — `saveTokenToConfig` no longer renames existing registry entries; preserves original name and scopes
- **`spm publish` silent failures** — spinner stops before error display; errors shown with proper formatting
- **CLI hint typos** — all references to `skills publish/validate/install/registry` corrected to `spm`
- **Build missing execute permission** — `npm run build` now includes `chmod +x dist/cli/index.js`

## [0.4.4] - 2026-03-17

## [0.4.3] - 2026-03-17

## [0.5.0] - 2026-03-16

### Added

- **Permission Proxy Tools** — four new MCP tools (`skill_exec_bash`, `skill_exec_write`, `skill_exec_read`, `skill_exec_fetch`) that enforce skill-declared permissions at runtime. When a skill declares `permissions: ["file:read", "file:write"]` in `skill.json`, the proxy tools block any undeclared operations (e.g. bash execution, network access) and return a permission denied error
- **`file_scope` enforcement** — skills can restrict file operations to specific directories via `security.file_scope` in `skill.json`. The proxy tools validate every file path against the declared scope using `path.resolve()` + prefix matching, preventing path traversal attacks
- **Policy injection in `skill_load`** — when proxy tools are enabled, `skill_load` injects a `<SKILL_POLICY>` block into the response that instructs the model which proxy tools to use and which actions are denied
- **Violation tracking** — when a proxy tool denies an action, it automatically records a `violation` feedback entry via `skill_feedback`, which feeds into the confidence scoring system. Skills that trigger violations get lower confidence over time
- **Audit log** — every proxy tool call is recorded in an in-memory audit log with timestamp, skill name, tool, action, and allowed/denied status (accessible via `getAuditLog()`)
- **`LoadedSkillSession` type** — session state now tracks permissions and file_scope per loaded skill, enabling runtime enforcement

### Changed

- **`skill_load` response includes `file_scope`** — metadata now exposes the loaded skill's file_scope alongside permissions
- **`skill_context` shows permissions** — loaded skills in session context now include their permissions and file_scope

## [0.4.2] - 2026-03-16

### Changed

- **`spm search` searches everywhere by default** — remote registries are now included in search results by default (was local-only); use `--local` to search locally only, `--remote` for remote only
- **Remote results sorted by popularity** — remote search results are sorted by install count (descending)
- **Interactive install from search** — after displaying remote results, `spm search` offers a multiselect prompt to install selected skills directly
- **Interactive `spm remove` / `spm uninstall`** — skill name is now optional; when omitted, shows an interactive picker with all installed skills
- **Interactive `spm persona remove`** — persona name is now optional; when omitted, shows an interactive picker with all installed personas
- **Truncated long descriptions** — search result descriptions are truncated to prevent UI breakage in terminal

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
- **Persona storage**: `~/.spm/personas/` (global) and `.spm/personas/` (project-level, overrides global)
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

- **Core engine**: skill indexer, loader, registry with global (`~/.spm/`) and project-level (`.spm/`) support
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
