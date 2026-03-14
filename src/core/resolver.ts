import semver from "semver";
import type { SkillDependencies } from "../types/index.js";
import type { RegistryClient } from "./registry-client.js";

export interface ResolvedDependency {
  name: string;
  range: string;
  resolved: string; // concrete version
}

export interface ResolveResult {
  resolved: ResolvedDependency[];
  missing: { name: string; range: string; reason: string }[];
}

// Resolves semver ranges to concrete versions using the registry.
// Detects cycles via the `visited` set.
export async function resolveDependencies(
  dependencies: SkillDependencies,
  client: RegistryClient,
  visited: Set<string> = new Set(),
): Promise<ResolveResult> {
  const resolved: ResolvedDependency[] = [];
  const missing: ResolveResult["missing"] = [];

  for (const [name, range] of Object.entries(dependencies)) {
    if (visited.has(name)) {
      continue; // skip cycles
    }

    if (!semver.validRange(range)) {
      missing.push({ name, range, reason: `invalid semver range "${range}"` });
      continue;
    }

    // Dependency names use author/name format
    const slashIdx = name.indexOf("/");
    if (slashIdx === -1) {
      missing.push({ name, range, reason: `invalid dependency name "${name}", expected author/name` });
      continue;
    }
    const depAuthor = name.slice(0, slashIdx);
    const depName = name.slice(slashIdx + 1);

    const versions = await client.getVersions(depAuthor, depName);
    if (versions.length === 0) {
      missing.push({ name, range, reason: "not found in registry" });
      continue;
    }

    const available = versions
      .map((v) => v.version)
      .filter((v) => semver.valid(v) !== null);

    const best = semver.maxSatisfying(available, range);
    if (!best) {
      missing.push({
        name,
        range,
        reason: `no version satisfies "${range}" (available: ${available.join(", ")})`,
      });
      continue;
    }

    resolved.push({ name, range, resolved: best });
  }

  return { resolved, missing };
}
