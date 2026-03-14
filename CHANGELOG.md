# Changelog

## [0.10.0] - 2026-03-12

### Phase 5 — Semver Dependency Resolution

Skills with dependencies now auto-resolve and auto-install transitive dependencies from the registry during `skills install`.

### Added

- **Dependency resolver** (`src/core/resolver.ts`):
  - Resolves semver ranges (`^`, `~`, `>=`, exact) to concrete versions via registry
  - Cycle detection via visited set
  - Reports missing skills, unsatisfied ranges, invalid ranges
- **Server endpoint**: `GET /api/skills/:name/versions` — lists all published versions of a skill
- **Registry client**: `getVersions(name)` method for fetching available versions
- **Auto-install dependencies**: `skills install @scope/name` now resolves and installs transitive dependencies from registry
- **8 tests** for resolver (exact, caret, tilde, missing, cycles, multiple deps)

### Changed

- `installFromRegistry` refactored into `installSingleFromRegistry` + dependency resolution layer
- Health endpoint version bumped to `0.10.0`

---

## [0.9.0] - 2026-03-12

### Phase 4, Iteration 7 — Deployment Config + skills convert

Production deployment configuration for Fly.io + Tigris. New `skills convert` command for converting existing prompts into skills.

### Added

- **Deployment config**:
  - `Dockerfile` — multi-stage build (Node 22, TypeScript build → production image)
  - `fly.toml` — Fly.io config (Amsterdam region, health checks, auto-suspend)
  - `.dockerignore` — excludes tests, docs, dev files from image
  - `src/server/start.ts` — standalone server entrypoint for Docker
  - `npm run server` script
- **`skills convert <source>`** — convert prompt files (.md, .txt, .prompt) into skill scaffolds:
  - Single file or directory of prompts
  - Interactive mode: prompts for author, scope, license
  - Non-interactive: `--author`, `--scope`, `--license`, `--output` flags
  - Slugifies file names, creates skill.json + SKILL.md per prompt
  - 5 tests covering single file, directory, skip existing, slugify, .prompt extension

### Changed

- `.gitignore` updated: added `dist`, `.env`, `.env.*`

---

## [0.8.0] - 2026-03-11

### Phase 4, Iterations 4-6 — Install Flow, Update Command, GitHub OAuth

Install flow now downloads `.tar.gz` packages from S3 via presigned URLs with integrity verification. New `skills update` command for re-publishing skills. GitHub OAuth device flow for CLI authentication.

### Added

- **Install from S3** (Iteration 4):
  - `installFromRegistry` downloads .tar.gz via presigned URL from `getDownloadUrl()`
  - SHA-256 integrity verification before unpack
  - DB content fallback for backwards compatibility
  - 4 new tests in `tests/install-s3.test.ts`
- **`skills update <source>`** (Iteration 5):
  - Verifies skill exists in registry, packages and re-publishes
  - Shows version diff: "Updated @author/skill@1.1.0 (was 1.0.0)"
  - Supports `--registry` and `--dry-run` flags
- **GitHub device flow** (Iteration 6):
  - `POST /auth/github/device` — initiates GitHub device flow, returns `user_code` and `verification_uri`
  - `POST /auth/github/device/poll` — polls for completion, returns API token when authorized
  - In-memory session store with TTL and automatic cleanup
  - Creates or links author by `github_id` (new → create, existing name → link, existing github_id → reuse)
- **DB schema**: `github_id` column on `authors` table (nullable, unique) for GitHub account linking
- **Registry client methods**: `startDeviceAuth()`, `pollDeviceAuth(sessionId)`
- **CLI `skills login --github`**:
  - Initiates device flow against registry server
  - Opens browser automatically, shows code for manual entry
  - Polls until authorized, saves token to config
- **7 new tests** for device auth client methods

### Changed

- **`skills login`**: registry URL is now optional (auto-selects if only one configured)
- **`skills login --name`**: still works for direct registration (backwards compatible)
- **Server env**: `GITHUB_CLIENT_ID` required for GitHub OAuth (server works without it, returns 503)
- Health endpoint version bumped to `0.8.0`

---

## [0.7.0] - 2026-03-11

### Phase 4, Iteration 3 — Publish & Download via S3

Publish flow now packages skills as `.tar.gz` and uploads to S3. Download endpoint returns presigned URLs for fast install. Server initializes storage provider on startup and supports multipart upload.

### Added

- **Multipart publish** (`POST /api/skills`):
  - Accepts `multipart/form-data` with `metadata` (JSON) + `archive` (.tar.gz file)
  - Server uploads archive to S3 via `StorageProvider`, stores `s3_key` in PostgreSQL
  - On update, cleans up old S3 object if key changed
  - Legacy JSON body path preserved for GitHub source and backwards compatibility
- **Download endpoint** (`GET /api/skills/:name/download`):
  - Returns presigned S3 URL when package is in S3 (`download_url` field)
  - Falls back to DB content when no S3 package (`content` field)
  - Increments install counter
- **Registry client methods**:
  - `publishWithArchive(metadata, archive)` — sends multipart FormData with archive buffer
  - `getDownloadUrl(name, version?)` — fetches presigned URL or content fallback
  - `PublishResult` and `DownloadResult` types exported
- **CLI publish improvements**:
  - `skills publish ./my-skill` now packages skill as `.tar.gz` before upload
  - Displays package size, token estimate after publish
  - Dry-run shows package size, file count, integrity hash

### Changed

- **Server startup** (`src/server/index.ts`):
  - Initializes `StorageProvider` from env config (`STORAGE_TYPE`, `S3_*`)
  - Registers `@fastify/multipart` plugin (50 MB file size limit)
  - Passes `StorageProvider | null` to skill routes
  - Storage is optional — server works in DB-only mode without S3 config
- Health endpoint version bumped to `0.6.0`

### Dependencies added

- `@fastify/multipart` — multipart form data parsing for Fastify

---

## [0.6.0] - 2026-03-11

### Phase 4, Iteration 2 — S3 Storage Provider & Skill Packager

Storage infrastructure for skill packages. S3-compatible provider for production, local filesystem provider for development. Skill directories are packed into `.tar.gz` archives with SHA-256 integrity hashes.

### Added

- **Storage provider system** (`src/core/storage/`):
  - `StorageProvider` interface — `upload`, `download`, `getSignedUrl`, `delete`, `exists`
  - `S3StorageProvider` — production provider via `@aws-sdk/client-s3` (supports AWS S3, Tigris, R2, MinIO)
  - `LocalStorageProvider` — local filesystem provider for development (same interface)
  - `createStorageProvider(config)` factory — instantiates provider by config type
  - `loadStorageConfigFromEnv()` — reads `STORAGE_TYPE`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` from env
- **Skill packager** (`src/core/storage/packager.ts`):
  - `packSkill(dir)` — collects skill directory into `.tar.gz` with SHA-256 integrity hash
  - `unpackSkill(data, destDir)` — extracts `.tar.gz` archive into target directory
  - `computeIntegrity(data)` — SHA-256 hash for verification
  - Ignores `node_modules`, `.git`, `.DS_Store`, `Thumbs.db`
- **S3 key helper**: `buildSkillS3Key(author, name, version)` → `skills/{author}/{name}/{version}.tar.gz`
- **Tests**: 12 tests covering LocalStorageProvider, packSkill/unpackSkill roundtrip, nested dirs, ignore patterns, integrity verification

### Changed

- **DB schema**: added `s3_key` column to `skills` table; `entry_content` is now nullable (content lives in S3, DB stores preview for search)
- **Migration**: `ALTER TABLE skills ADD COLUMN IF NOT EXISTS s3_key TEXT`, `ALTER COLUMN entry_content DROP NOT NULL`

### Dependencies added

- `@aws-sdk/client-s3` — S3 client
- `@aws-sdk/s3-request-presigner` — presigned URL generation
- `tar-stream` — tar archive creation/extraction

---

## [0.5.0] - 2026-03-11

### Phase 4, Iteration 1 — Architecture Pivot: Remove Blockchain

Removed all blockchain/NFT/token infrastructure. The project now uses a simpler centralized architecture: S3-compatible storage for skill packages, PostgreSQL for metadata, API token auth for publishing.

### Removed

- **Blockchain code**: `contracts/` (Solidity smart contracts, tests, deploy scripts), `src/core/blockchain/` (wallet, contracts, IPFS, chain-config, ABIs)
- **Reward system**: `src/server/rewards/` (merkle trees, anti-fraud), `src/server/routes/rewards.ts`, reward API endpoints
- **Blockchain CLI commands**: `skills wallet`, `skills rewards`, blockchain-based `skills update`
- **Blockchain publish path**: `--chain` flag, `WALLET_PRIVATE_KEY` auto-detection, NFT minting in `skills publish`
- **DB tables**: `reward_epochs`, `reward_leaves`; `reporter_address` column from `skill_feedback`
- **Dependencies**: `viem` (EVM client)

### Changed

- `skills publish` — simplified to registry-only (removed `--chain` flag and blockchain path)
- `src/server/index.ts` — removed reward routes registration
- `src/types/index.ts` — removed blockchain type re-exports, removed `blockchain`/`ipfs` from `SkillsConfig`
- `src/core/config.ts` — removed blockchain/ipfs config fields
- Documentation updated: spec, phase4 plan, architecture, CLI reference, getting started, creating skills

### Technical decisions

- **Blockchain removed**: excessive complexity without proportional value at current stage
- **S3 storage planned**: Tigris (Fly.io) as primary, any S3-compatible provider supported
- **Auth model**: API tokens for CLI (existing), GitHub OAuth planned for Web UI
- **Dual storage**: entry content in PostgreSQL (for search/quick access) + full .tar.gz packages in S3

---

## [0.4.0] - 2026-03-11

### Phase 3 — Remote Registry

Skills can be published, discovered, and installed from remote registries. Anyone can run a private registry server. GitHub integration for skill hosting (public + private repos).

### Added

- **Registry server** (`src/server/`):
  - Fastify HTTP server with auto-migration on startup
  - PostgreSQL via Drizzle ORM — skills, authors, feedback, API tokens
  - REST API: publish, search, content download, feedback, author profiles
  - GraphQL API (`/graphql`): search, skill details, author queries
  - Token-based authentication (register → get API token)
  - Confidence recalculation on feedback
  - `skills server start` — launch a registry server (`DATABASE_URL` required)
- **GitHub integration** (`src/server/github/`):
  - Fetch skills from GitHub repos (public + private via PAT)
  - Parse multiple URL formats: `https://github.com/owner/repo/tree/branch/path`, `github:owner/repo`, `owner/repo`
  - Download full skill directory for install
  - Publish from GitHub source (server fetches content)
- **Multi-registry config**:
  - `registries[]` in `config.json` — named registries with URL and optional token
  - `scopes` mapping — bind `@scope` to a specific registry (e.g. `@company → company-registry`)
  - `github.token` for private repo access
  - `resolveRegistry()` / `getRegistryToken()` helpers
- **Registry client** (`src/core/registry-client.ts`):
  - HTTP client for communicating with remote registries
  - `RegistryClient` class: search, getSkill, getContent, publish, register, sendFeedback
  - `getClientForSkill()` — resolves skill name → correct registry client via scope config
- **CLI commands**:
  - `skills search <query> [--remote|--all]` — search local and/or remote registries
  - `skills publish <source> [--registry name] [--github]` — publish from local path or GitHub URL
  - `skills login <registry-url> --name <author>` — register + save token
  - `skills registry add <url> [--name] [--token] [--scope]` — add registry to config
  - `skills server start [-p port] [--database-url]` — start registry server
- **Enhanced `skills install`**:
  - `skills install <local-path>` — existing local install
  - `skills install @scope/name [--version]` — install from remote registry
  - `skills install <github-url> [--github token]` — install directly from GitHub
- **MCP tools**:
  - `skill_search` now accepts `scope` param: `local`, `remote`, or `all`
  - `skill_install` — new tool, installs skills from remote registry (requires user confirmation)
- **New types**: `RegistryEntry`, `RemoteSkillEntry`, `PublishRequest`, `RegistrySearchResult`
- **DB schema**: `authors`, `skills`, `skill_feedback`, `api_tokens` tables with GIN index on tags

### Changed

- Config system extended: `SkillsConfig` now includes `registries`, `scopes`, `github`
- MCP server version bumped to 0.4.0
- Server instructions updated with remote search and install guidance
- CLI version bumped to 0.4.0

### Dependencies added

- `fastify` — HTTP server
- `drizzle-orm` + `postgres` — PostgreSQL ORM
- `graphql` + `graphql-yoga` — GraphQL server
- `@octokit/rest` — GitHub API client
- `semver` — version resolution

## [0.3.0] - 2026-03-11

### Phase 2 — Feedback + Quality

Skills learn from usage. The system collects feedback, calculates confidence, and surfaces metrics via CLI and MCP.

### Added

- **Feedback system**:
  - `FeedbackEntry`, `FeedbackStore`, `SkillStats` types — structured feedback data model
  - `src/core/feedback.ts` — storage CRUD (`addFeedback`, `getEntriesForSkill`, `getAllStats`, `getStatsForSkill`)
  - `src/core/config.ts` — read/write `config.json` with safe merge over defaults
  - Path helpers: `getFeedbackPath()`, `getConfigPath()`
  - Confidence formula: `success_rate × min(1, log₂(usage_count + 1) / 5)`
- **MCP tool `skill_feedback`** — records usage result (success/partial/failure/false_trigger) with optional comment
- **Enhanced `skill_load`** — response now includes metadata block with `confidence`, `works_with`, `permissions`
- **Enhanced `skill_search`** — results include `confidence` score per skill
- **Config-based tool toggles** — each MCP tool registered only if enabled in `config.json`; `skill_feedback` also requires `feedback.enabled`
- **CLI commands**:
  - `skills stats` — feedback dashboard (uses, success rate, rating, confidence with ⚠ for low confidence)
  - `skills rate <name> --score <1-5> [--comment]` — explicit user feedback
- **`skills init`** now uses canonical `getDefaultConfig()` from `src/core/config.ts`

### Changed

- `createServer()` is now async (reads config before registering tools)
- MCP server version bumped to 0.3.0
- Server instructions updated with feedback workflow and confidence guidance

## [0.2.0] - 2026-03-11

### Phase 1 — CLI "npm for skills"

Full local workflow through CLI. Create, validate, install, and manage skills.

### Added

- **CLI commands**:
  - `skills init [--project]` — initialize global or per-project skills directory
  - `skills create <name> [-s scope]` — scaffold a new skill with template
  - `skills validate <path>` — validate skill.json and file structure
  - `skills install <path>` — install from local path with auto reindex + lock
  - `skills uninstall <name>` — remove skill with auto reindex + lock
  - `skills list [-v]` — list installed skills (verbose mode available)
  - `skills info <name>` — detailed skill information (permissions, works_with, etc.)
  - `skills reindex [--project]` — rebuild index manually
- **Lock file** (`skills.lock`): auto-generated on install/uninstall with SHA-256 integrity hashes and token estimates
- **MCP tools**:
  - `skill_context` — shows loaded skills, token budget used/available
  - `skill_search` — search by keyword, tag, file pattern with scoring
- **Session tracking**: MCP server tracks which skills are loaded per session
- **Documentation** (`docs/`):
  - `getting-started.md` — installation, setup, client integration
  - `cli-reference.md` — all CLI commands with options and examples
  - `creating-skills.md` — guide to writing skills (skill.json, SKILL.md, tips)
  - `architecture.md` — system design, components, lazy loading, security

## [0.1.0] - 2026-03-11

### Phase 0 — "Hello, Skill"

First working prototype. Skills can be installed manually, indexed, and served to any MCP-compatible AI client.

### Added

- **Core types**: `SkillManifest`, `SkillIndex`, `LoadedSkill`, `SkillsLock` TypeScript definitions
- **JSON Schema validation** for `skill.json` with full spec compliance (schema_version, trigger, security, compatibility, works_with, etc.)
- **Indexer**: scans `~/.skills/installed/` (global) and `.skills/installed/` (per-project), generates `index.json` with token estimates
- **Registry**: reads and merges global + project indexes; project-level skills override global by name
- **Loader**: loads `SKILL.md` content from disk with metadata (permissions, works_with)
- **MCP server** (stdio transport) with two tools:
  - `skill_list` — returns compact list of all installed skills
  - `skill_load` — loads a skill's full instructions into model context
- **CLI**: `skills serve` command to start MCP server
- **Reindex script**: `npm run reindex` to rebuild `index.json`
- **3 starter skills**:
  - `@examples/hello-world` — demo skill for testing
  - `@core/docx` — Word document creation with python-docx
  - `@core/xlsx` — Excel spreadsheet creation with openpyxl
- **Verified integration** with Claude Desktop and Zed IDE
