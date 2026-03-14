#!/usr/bin/env node

import fs from "node:fs/promises";
import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../mcp/server.js";
import { initCommand } from "./commands/init.js";
import { createCommand } from "./commands/create.js";
import { validateCommand } from "./commands/validate.js";
import { installCommand } from "./commands/install.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { listCommand } from "./commands/list.js";
import { infoCommand } from "./commands/info.js";
import { statsCommand } from "./commands/stats.js";
import { rateCommand } from "./commands/rate.js";
import { searchCommand } from "./commands/search.js";
import { publishCommand } from "./commands/publish.js";
import { loginCommand, addRegistryCommand } from "./commands/login.js";
import { updateCommand } from "./commands/update.js";
import { convertCommand } from "./commands/convert.js";
import { connectCommand, disconnectCommand } from "./commands/connect.js";
import { writeIndex } from "../core/indexer.js";
import {
  getGlobalSkillsDir,
  getProjectSkillsDir,
  getInstalledDir,
} from "../core/paths.js";

const program = new Command();

program
  .name("spm")
  .description("Skillbase — AI skill manager")
  .version("0.10.0");

program
  .command("init")
  .description("Initialize skills directory")
  .option(
    "--project",
    "Initialize in current project (.skills/) instead of global (~/.skills/)",
  )
  .action(initCommand);

program
  .command("create <name>")
  .description("Create a new skill scaffold")
  .option("-s, --scope <scope>", "Skill scope", "user")
  .action(createCommand);

program
  .command("validate <path>")
  .description("Validate a skill directory")
  .action(validateCommand);

program
  .command("install [source]")
  .description("Install skill(s). Without args installs all from skill.json")
  .option("-g, --global", "Install globally instead of project-local")
  .option("-v, --version <version>", "Specific version to install")
  .option("--github <token>", "GitHub personal access token for private repos")
  .action(installCommand);

program
  .command("uninstall <name>")
  .description("Uninstall a skill")
  .action(uninstallCommand);

program
  .command("list")
  .description("List installed skills")
  .option("-v, --verbose", "Show detailed information")
  .action(listCommand);

program
  .command("info <name>")
  .description("Show detailed information about a skill")
  .action(infoCommand);

program
  .command("stats")
  .description("Show feedback statistics for installed skills")
  .action(statsCommand);

program
  .command("rate <name>")
  .description("Rate a skill (explicit feedback)")
  .requiredOption("--score <score>", "Rating from 1 to 5")
  .option("--comment <comment>", "Optional comment")
  .action(rateCommand);

program
  .command("search <query>")
  .description("Search for skills locally and/or in remote registries")
  .option("--remote", "Search remote registries only")
  .option("--all", "Search both local and remote")
  .action(searchCommand);

program
  .command("publish <source>")
  .description("Publish a skill to registry")
  .option("--registry <name>", "Publish to a specific registry")
  .option("--github", "Source is a GitHub URL")
  .option("--dry-run", "Show what would happen without executing")
  .action(publishCommand);

program
  .command("update <source>")
  .description("Update an existing skill in the registry (re-publish)")
  .option("--registry <name>", "Target registry")
  .option("--dry-run", "Show what would happen without executing")
  .action(updateCommand);

program
  .command("convert <source>")
  .description("Convert prompt files (.md, .txt) into skill scaffolds")
  .option("--author <author>", "Author name")
  .option("--scope <scope>", "Skill scope (default: user)")
  .option("--license <license>", "License (default: MIT)")
  .option("-o, --output <dir>", "Output directory (default: current)")
  .action(convertCommand);

program
  .command("login [registry-url]")
  .description("Authenticate with a registry server")
  .option("--name <name>", "Your author name (for direct registration)")
  .option("--github", "Authenticate via GitHub OAuth")
  .action(loginCommand);

// Registry management subcommand
const registryCmd = program
  .command("registry")
  .description("Manage remote registries");

registryCmd
  .command("add <url>")
  .description("Add a remote registry")
  .option("--name <name>", "Registry name (auto-generated from URL if omitted)")
  .option("--token <token>", "API token")
  .option("--scope <scope>", "Bind a scope to this registry (e.g. @company)")
  .action(addRegistryCommand);

program
  .command("connect <client>")
  .description("Connect skills to an AI client (claude, zed)")
  .action(connectCommand);

program
  .command("disconnect <client>")
  .description("Disconnect skills from an AI client (claude, zed)")
  .action(disconnectCommand);

program
  .command("reindex")
  .description("Rebuild skill index")
  .option("--project", "Reindex project skills only")
  .action(async (options: { project?: boolean }) => {
    const globalDir = getGlobalSkillsDir();
    const projectDir = getProjectSkillsDir(process.cwd());

    if (!options.project) {
      const index = await writeIndex(globalDir);
      console.log(`Global: ${index.skills.length} skill(s) indexed`);
    }

    if (options.project) {
      const installedDir = getInstalledDir(projectDir);
      try {
        const stat = await fs.stat(installedDir);
        if (stat.isDirectory()) {
          const index = await writeIndex(projectDir);
          console.log(`Project: ${index.skills.length} skill(s) indexed`);
        }
      } catch {
        console.log("No .skills/installed/ directory in current project.");
      }
    }
  });

program
  .command("serve")
  .description("Start the MCP server (stdio transport)")
  .option("--stdio", "Use stdio transport (default)", true)
  .action(async () => {
    const server = await createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });

program.parse();
