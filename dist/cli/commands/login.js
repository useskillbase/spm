import { execFile } from "node:child_process";
import { readConfig, writeConfig } from "../../core/config.js";
import { RegistryClient } from "../../core/registry-client.js";
import { log, spinner, note, select, isCancel, cancel, exitError } from "../ui.js";
export const commands = [
    {
        name: "login",
        description: "Authenticate with a registry server",
        group: "registry",
        args: [{ name: "registry-url", required: false }],
        options: [
            { flags: "--name <name>", description: "Your author name (for direct registration)" },
            { flags: "--github", description: "Authenticate via GitHub OAuth" },
        ],
        handler: loginCommand,
    },
    {
        name: "registry",
        description: "Manage remote registries",
        group: "registry",
        subcommands: [
            {
                name: "add",
                description: "Add a remote registry",
                group: "registry",
                args: [{ name: "url", required: true }],
                options: [
                    { flags: "--name <name>", description: "Registry name (auto-generated from URL if omitted)" },
                    { flags: "--token <token>", description: "API token" },
                    { flags: "--scope <scope>", description: "Bind a scope to this registry (e.g. @company)" },
                ],
                handler: addRegistryCommand,
            },
        ],
    },
];
function resolveRegistryName(registryUrl) {
    const urlObj = new URL(registryUrl);
    return urlObj.hostname.replace(/\./g, "-");
}
async function saveTokenToConfig(registryUrl, token) {
    const config = await readConfig();
    const registryName = resolveRegistryName(registryUrl);
    const existingIdx = config.registries.findIndex((r) => r.url === registryUrl);
    if (existingIdx >= 0) {
        config.registries[existingIdx].token = token;
    }
    else {
        config.registries.push({ name: registryName, url: registryUrl, token });
    }
    if (!config.scopes["*"] || config.scopes["*"] === "public") {
        config.scopes["*"] = registryName;
    }
    await writeConfig(config);
    return registryName;
}
async function resolveRegistryUrl(registryUrl) {
    if (registryUrl)
        return registryUrl;
    const config = await readConfig();
    if (config.registries.length === 0) {
        exitError("No registries configured. Specify a registry URL or run: skills registry add <url>");
    }
    if (config.registries.length === 1) {
        return config.registries[0].url;
    }
    // Multiple registries — let user pick
    const choice = await select({
        message: "Select a registry:",
        options: config.registries.map((r) => ({
            value: r.url,
            label: `${r.name} (${r.url})`,
        })),
    });
    if (isCancel(choice)) {
        cancel("Cancelled.");
        process.exit(0);
    }
    return choice;
}
export async function loginCommand(registryUrl, options) {
    const url = await resolveRegistryUrl(registryUrl);
    if (options.github) {
        await loginWithGithub(url);
    }
    else {
        await loginWithName(url, options.name);
    }
}
async function loginWithName(registryUrl, name) {
    if (!name) {
        exitError("--name is required for direct registration.\nOr use --github to authenticate via GitHub.");
    }
    const client = new RegistryClient(registryUrl);
    try {
        const result = await client.register(name);
        log.success(`Registered as "${result.author.name}" (id: ${result.author.id})`);
        const registryName = await saveTokenToConfig(registryUrl, result.token);
        log.info(`Token saved to config (registry: ${registryName})`);
        log.message("You can now publish skills with: skills publish <path>");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        exitError(`Login failed: ${message}`);
    }
}
function openBrowser(url) {
    const cmd = process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
            ? "cmd"
            : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", url] : [url];
    try {
        execFile(cmd, args, () => { });
    }
    catch {
        // Best-effort, user can open manually
    }
}
async function loginWithGithub(registryUrl) {
    const client = new RegistryClient(registryUrl);
    try {
        const device = await client.startDeviceAuth();
        note(`URL: ${device.verification_uri}\nCode: ${device.user_code}`, "Open in browser and enter the code");
        openBrowser(device.verification_uri);
        const s = spinner();
        s.start("Waiting for authorization...");
        let interval = device.interval * 1000;
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, interval));
            const poll = await client.pollDeviceAuth(device.session_id);
            if (poll.status === "complete" && poll.author && poll.token) {
                s.stop(`Authenticated as "${poll.author.name}" (id: ${poll.author.id})`);
                const registryName = await saveTokenToConfig(registryUrl, poll.token);
                log.info(`Token saved to config (registry: ${registryName})`);
                log.message("You can now publish skills with: skills publish <path>");
                return;
            }
            if (poll.interval) {
                interval = poll.interval * 1000;
            }
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        exitError(`GitHub login failed: ${message}`);
    }
}
export async function addRegistryCommand(registryUrl, options) {
    const config = await readConfig();
    const urlObj = new URL(registryUrl);
    const registryName = options.name ?? urlObj.hostname.replace(/\./g, "-");
    const existingIdx = config.registries.findIndex((r) => r.name === registryName);
    if (existingIdx >= 0) {
        config.registries[existingIdx].url = registryUrl;
        if (options.token)
            config.registries[existingIdx].token = options.token;
        log.success(`Updated registry "${registryName}"`);
    }
    else {
        config.registries.push({
            name: registryName,
            url: registryUrl,
            token: options.token,
        });
        log.success(`Added registry "${registryName}" (${registryUrl})`);
    }
    if (options.scope) {
        config.scopes[options.scope] = registryName;
        log.info(`Scope "${options.scope}" → "${registryName}"`);
    }
    await writeConfig(config);
}
//# sourceMappingURL=login.js.map