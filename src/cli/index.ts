#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { loadCommands } from "./loader.js";
import { configureHelp } from "./help.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

const program = new Command();

program
  .name("spm")
  .description("Skillbase — AI skills manager")
  .version(pkg.version);

configureHelp(program);
await loadCommands(program);

program.parse();
