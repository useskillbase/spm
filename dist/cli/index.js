#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { loadCommands } from "./loader.js";
import { configureHelp } from "./help.js";
const require = createRequire(import.meta.url);
const pkg = require("../../package.json");
const program = new Command();
program
    .name("spm")
    .description("Skillbase — AI skills manager")
    .version(pkg.version);
configureHelp(program);
await loadCommands(program);
program.configureOutput({
    writeErr: () => { },
    writeOut: (str) => process.stdout.write(str),
});
program.exitOverride();
try {
    await program.parseAsync();
}
catch (err) {
    if (err && typeof err === "object" && "exitCode" in err && err.exitCode === 0) {
        process.exit(0);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
}
//# sourceMappingURL=index.js.map