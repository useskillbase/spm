# Changelog

## [Unreleased]

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
- **`spm add <ref> --for [persona]`** — add skill reference to persona file(s) without installing; supports comma-separated names and interactive multiselect when multiple `.person.json` files exist
- **`spm remove <ref> --from [persona]`** — remove skill reference from persona file(s); supports comma-separated names and interactive multiselect
- **`spm persona activate <name>`** — activate a persona and auto-install any missing skills from its dependencies
- **`spm persona remove <name>`** — remove a persona from global installation (auto-deactivates if active)
- **CLI commands**: `spm persona create/list/activate/deactivate/info/remove/validate` — full persona lifecycle

### Changed

- **CLI command semantics redesigned** following yarn/pnpm conventions:
  - `spm install skill <ref>` → **`spm add <ref>`** (add a single skill, like `yarn add`)
  - `spm install` (no args) → installs all dependencies from `skill.json` (like `yarn install`)
  - `spm uninstall <name>` / `spm remove <name>` → unified skill removal (accepts bare name or `author/name`)
  - `spm remove <ref> --from [persona]` → remove a skill reference from persona file(s)
  - `spm create <name>` → simplified scaffold (removed `--scope`, skill name is plain)
  - `spm persona use` → **`spm persona activate`** (clearer semantics, auto-installs missing skills)
  - `spm persona off` → **`spm persona deactivate`**
- **Extensible command architecture** — commands are self-contained modules with declarative `CommandDef` exports; adding a new command = creating a file in `src/cli/commands/` (no `index.ts` changes needed). Entry point reduced from 277 lines to 20 lines.
- **Brand-themed CLI output** — custom logger with Skillbase brand colors (`#00e5a0` teal, `#22d3ee` cyan, `#ef4444` red) using true-color ANSI; replaces default `@clack/prompts` log styling
- **Grouped help output** — `spm --help` now shows commands organized by category (Manage skills, Review, Personas, Registry, System) with brand-colored formatting
- **Auto-discovery command loader** — dynamically imports all command files from `src/cli/commands/` at startup

## [0.1.4] - 2026-03-14

### Fixed

- **`connect`/`disconnect` now preserve JSONC comments and formatting** — switched from `JSON.parse`/`JSON.stringify` to `jsonc-parser` (`modify`/`applyEdits`). Previously, running `spm connect zed` on a `settings.json` with comments or trailing commas would silently drop all existing settings.

### Changed

- **Embedded skill index in MCP instructions** — at server startup, a compact pipe-delimited index (`name|tokens|trigger|tags|file_patterns`) is appended to MCP instructions so the model sees all available skills immediately without calling `skill_list`
- **Updated MCP instruction wording** — changed from "Use skill_list to discover" to "When a user's task matches a skill's trigger description, load it with skill_load before starting work"
- `skill_list` remains available for full programmatic access (versions, priorities) but is no longer required for discovery

---

## [0.1.3] - 2026-03-14

### Changed

- **MCP instructions include embedded skill index** — compact pipe-delimited format appended to server instructions at startup
- **Improved MCP instruction clarity** — model is now instructed to match tasks against trigger descriptions before loading

---

## [0.1.2] - 2026-03-14

### Changed

- **CLI version from package.json** — `spm --version` now reads version dynamically instead of hardcoded value
- **Branding**: renamed "SkillBase" → "Skillbase" in CLI description and MCP instructions
- Removed legacy documentation from `docs/` and `plans/` directories
- Code formatting cleanup across CLI and MCP server

---

## [0.1.1] - 2026-03-13

### Changed

- Fixed package name in `package.json`
- Fixed README formatting
- Added GitHub Actions publish workflow (`.github/workflows/publish.yml`)

---

## [0.1.0] - 2026-03-13

### Added

Initial public release. Full-featured AI skill manager with MCP integration.

- **Core engine**: skill indexer, loader, registry with global (`~/.skills/`) and project-level (`.skills/`) support
- **MCP server** (stdio transport) with 6 tools: `skill_list`, `skill_load`, `skill_context`, `skill_search`, `skill_feedback`, `skill_install`
- **CLI** (`spm`): `init`, `create`, `validate`, `install`, `uninstall`, `list`, `info`, `reindex`, `search`, `publish`, `update`, `login`, `rate`, `stats`, `convert`, `connect`, `disconnect`, `serve`, `server start`
- **Feedback & confidence system**: tracks usage results, calculates confidence scores per skill
- **Remote registry support**: publish, search, install from remote registries with multi-registry config and scope mapping
- **GitHub integration**: install skills from GitHub repos, OAuth device flow for CLI auth
- **S3 storage**: skill packages as `.tar.gz` with SHA-256 integrity, S3/Tigris upload, presigned download URLs
- **Dependency resolution**: semver ranges (`^`, `~`, `>=`, exact), cycle detection, transitive auto-install
- **Skill packager**: `.tar.gz` archiving with integrity hashes
- **`spm convert`**: convert existing `.md`/`.txt`/`.prompt` files into skill scaffolds
- **Deployment**: Dockerfile, `fly.toml` for Fly.io + Tigris
- **JSON Schema validation** for `skill.json` manifests
- **TypeScript** throughout, 150 tests
