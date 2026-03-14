import { execFile } from "node:child_process";
import { readConfig, writeConfig } from "../../core/config.js";
import { RegistryClient } from "../../core/registry-client.js";

function resolveRegistryName(registryUrl: string): string {
  const urlObj = new URL(registryUrl);
  return urlObj.hostname.replace(/\./g, "-");
}

async function saveTokenToConfig(
  registryUrl: string,
  token: string,
): Promise<string> {
  const config = await readConfig();
  const registryName = resolveRegistryName(registryUrl);

  const existingIdx = config.registries.findIndex((r) => r.url === registryUrl);
  if (existingIdx >= 0) {
    config.registries[existingIdx].token = token;
  } else {
    config.registries.push({ name: registryName, url: registryUrl, token });
  }

  if (!config.scopes["*"] || config.scopes["*"] === "public") {
    config.scopes["*"] = registryName;
  }

  await writeConfig(config);
  return registryName;
}

async function resolveRegistryUrl(
  registryUrl?: string,
): Promise<string> {
  if (registryUrl) return registryUrl;

  const config = await readConfig();
  if (config.registries.length === 0) {
    console.error("Error: no registries configured. Specify a registry URL or run: skills registry add <url>");
    process.exit(1);
  }
  if (config.registries.length === 1) {
    return config.registries[0].url;
  }

  console.log("Available registries:");
  for (let i = 0; i < config.registries.length; i++) {
    console.log(`  [${i + 1}] ${config.registries[i].name} (${config.registries[i].url})`);
  }
  console.error("Error: multiple registries configured. Specify the URL: skills login <registry-url>");
  process.exit(1);
}

export async function loginCommand(
  registryUrl: string | undefined,
  options: { name?: string; github?: boolean },
): Promise<void> {
  const url = await resolveRegistryUrl(registryUrl);

  if (options.github) {
    await loginWithGithub(url);
  } else {
    await loginWithName(url, options.name);
  }
}

async function loginWithName(
  registryUrl: string,
  name?: string,
): Promise<void> {
  if (!name) {
    console.error("Error: --name is required for direct registration.");
    console.error("Or use --github to authenticate via GitHub.");
    process.exit(1);
  }

  const client = new RegistryClient(registryUrl);

  try {
    const result = await client.register(name);
    console.log(`Registered as "${result.author.name}" (id: ${result.author.id})`);

    const registryName = await saveTokenToConfig(registryUrl, result.token);

    console.log(`Token saved to config (registry: ${registryName})`);
    console.log(`\nYou can now publish skills with: skills publish <path>`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Login failed: ${message}`);
    process.exit(1);
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";

  const args =
    process.platform === "win32" ? ["/c", "start", url] : [url];

  try {
    execFile(cmd, args, () => {});
  } catch {
    // Best-effort, user can open manually
  }
}

async function loginWithGithub(registryUrl: string): Promise<void> {
  const client = new RegistryClient(registryUrl);

  try {
    const device = await client.startDeviceAuth();

    console.log(`\nOpen this URL in your browser:\n`);
    console.log(`  ${device.verification_uri}\n`);
    console.log(`And enter the code: ${device.user_code}\n`);

    openBrowser(device.verification_uri);

    console.log("Waiting for authorization...");

    let interval = device.interval * 1000;

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, interval));

      const poll = await client.pollDeviceAuth(device.session_id);

      if (poll.status === "complete" && poll.author && poll.token) {
        console.log(`\nAuthenticated as "${poll.author.name}" (id: ${poll.author.id})`);

        const registryName = await saveTokenToConfig(registryUrl, poll.token);

        console.log(`Token saved to config (registry: ${registryName})`);
        console.log(`\nYou can now publish skills with: skills publish <path>`);
        return;
      }

      if (poll.interval) {
        interval = poll.interval * 1000;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`GitHub login failed: ${message}`);
    process.exit(1);
  }
}

export async function addRegistryCommand(
  registryUrl: string,
  options: { name?: string; token?: string; scope?: string },
): Promise<void> {
  const config = await readConfig();

  const urlObj = new URL(registryUrl);
  const registryName = options.name ?? urlObj.hostname.replace(/\./g, "-");

  const existingIdx = config.registries.findIndex((r) => r.name === registryName);
  if (existingIdx >= 0) {
    config.registries[existingIdx].url = registryUrl;
    if (options.token) config.registries[existingIdx].token = options.token;
    console.log(`Updated registry "${registryName}"`);
  } else {
    config.registries.push({
      name: registryName,
      url: registryUrl,
      token: options.token,
    });
    console.log(`Added registry "${registryName}" (${registryUrl})`);
  }

  if (options.scope) {
    config.scopes[options.scope] = registryName;
    console.log(`Scope "${options.scope}" → "${registryName}"`);
  }

  await writeConfig(config);
}
