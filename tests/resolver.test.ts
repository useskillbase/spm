import { describe, it, expect, vi } from "vitest";
import { resolveDependencies } from "../src/core/resolver.js";
import { RegistryClient } from "../src/core/registry-client.js";

function mockClient(
  versionMap: Record<string, string[]>,
): RegistryClient {
  const client = new RegistryClient("http://fake");
  vi.spyOn(client, "getVersions").mockImplementation(async (author: string, name: string) => {
    const key = `${author}/${name}`;
    const versions = versionMap[key] ?? [];
    return versions.map((v) => ({ version: v, created_at: "2026-01-01T00:00:00Z" }));
  });
  return client;
}

describe("resolveDependencies", () => {
  it("resolves exact version", async () => {
    const client = mockClient({ "core/base": ["1.0.0", "1.1.0", "2.0.0"] });
    const result = await resolveDependencies({ "core/base": "1.1.0" }, client);

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].resolved).toBe("1.1.0");
    expect(result.missing).toHaveLength(0);
  });

  it("resolves caret range to latest matching", async () => {
    const client = mockClient({ "core/base": ["1.0.0", "1.2.0", "1.5.3", "2.0.0"] });
    const result = await resolveDependencies({ "core/base": "^1.0.0" }, client);

    expect(result.resolved[0].resolved).toBe("1.5.3");
  });

  it("resolves tilde range", async () => {
    const client = mockClient({ "core/base": ["1.0.0", "1.0.5", "1.1.0"] });
    const result = await resolveDependencies({ "core/base": "~1.0.0" }, client);

    expect(result.resolved[0].resolved).toBe("1.0.5");
  });

  it("reports missing skill", async () => {
    const client = mockClient({});
    const result = await resolveDependencies({ "core/missing": "^1.0.0" }, client);

    expect(result.resolved).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].reason).toBe("not found in registry");
  });

  it("reports no satisfying version", async () => {
    const client = mockClient({ "core/base": ["1.0.0", "1.1.0"] });
    const result = await resolveDependencies({ "core/base": ">=2.0.0" }, client);

    expect(result.resolved).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].reason).toContain("no version satisfies");
  });

  it("reports invalid semver range", async () => {
    const client = mockClient({});
    const result = await resolveDependencies({ "core/base": "not-semver" }, client);

    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].reason).toContain("invalid semver range");
  });

  it("resolves multiple dependencies", async () => {
    const client = mockClient({
      "core/base": ["1.0.0", "1.2.0"],
      "core/utils": ["2.0.0", "2.1.0", "3.0.0"],
    });
    const result = await resolveDependencies(
      { "core/base": "^1.0.0", "core/utils": "^2.0.0" },
      client,
    );

    expect(result.resolved).toHaveLength(2);
    expect(result.resolved.find((d) => d.name === "core/base")?.resolved).toBe("1.2.0");
    expect(result.resolved.find((d) => d.name === "core/utils")?.resolved).toBe("2.1.0");
  });

  it("skips already visited dependencies (cycle detection)", async () => {
    const client = mockClient({ "core/base": ["1.0.0"] });
    const visited = new Set(["core/base"]);
    const result = await resolveDependencies({ "core/base": "^1.0.0" }, client, visited);

    expect(result.resolved).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it("handles empty dependencies", async () => {
    const client = mockClient({});
    const result = await resolveDependencies({}, client);

    expect(result.resolved).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });
});
