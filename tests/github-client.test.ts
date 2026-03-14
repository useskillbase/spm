import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../src/core/github/client.js";

describe("parseGitHubUrl", () => {
  it("parses full HTTPS URL", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo", ref: undefined, path: undefined });
  });

  it("parses HTTPS URL with tree/branch/path", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/tree/main/skills/my-skill");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      ref: "main",
      path: "skills/my-skill",
    });
  });

  it("parses HTTPS URL with .git suffix", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo.git");
    expect(result).toEqual({ owner: "owner", repo: "repo", ref: undefined, path: undefined });
  });

  it("parses github: shorthand", () => {
    const result = parseGitHubUrl("github:owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo", path: undefined });
  });

  it("parses github: shorthand with path", () => {
    const result = parseGitHubUrl("github:owner/repo/skills/hello");
    expect(result).toEqual({ owner: "owner", repo: "repo", path: "skills/hello" });
  });

  it("parses owner/repo shorthand", () => {
    const result = parseGitHubUrl("owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo", path: undefined });
  });

  it("parses owner/repo/path shorthand", () => {
    const result = parseGitHubUrl("owner/repo/path/to/skill");
    expect(result).toEqual({ owner: "owner", repo: "repo", path: "path/to/skill" });
  });

  it("strips trailing slash", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/");
    expect(result).toEqual({ owner: "owner", repo: "repo", ref: undefined, path: undefined });
  });

  it("parses URL with branch only (no path)", () => {
    const result = parseGitHubUrl("https://github.com/owner/repo/tree/develop");
    expect(result).toEqual({ owner: "owner", repo: "repo", ref: "develop", path: undefined });
  });

  it("throws on invalid URL", () => {
    expect(() => parseGitHubUrl("github:")).toThrow();
  });
});
