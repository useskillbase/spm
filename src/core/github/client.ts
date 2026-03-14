import { Octokit } from "@octokit/rest";
import type { SkillManifest } from "../../types/index.js";

export interface GitHubSource {
  owner: string;
  repo: string;
  ref?: string; // branch or tag, defaults to default branch
  path?: string; // subpath within repo
}

export interface FetchedSkill {
  manifest: SkillManifest;
  entryContent: string;
  compactContent?: string;
}

export function parseGitHubUrl(url: string): GitHubSource {
  // Supports:
  //   https://github.com/owner/repo
  //   https://github.com/owner/repo/tree/main/path/to/skill
  //   github:owner/repo
  //   github:owner/repo/path/to/skill
  //   owner/repo (shorthand)
  let cleaned = url.trim();

  // Remove trailing slash
  cleaned = cleaned.replace(/\/$/, "");

  // github:owner/repo[/path]
  if (cleaned.startsWith("github:")) {
    const rest = cleaned.slice(7);
    const parts = rest.split("/");
    if (parts.length < 2) throw new Error(`Invalid GitHub URL: ${url}`);
    return {
      owner: parts[0],
      repo: parts[1],
      path: parts.length > 2 ? parts.slice(2).join("/") : undefined,
    };
  }

  // https://github.com/owner/repo[/tree/ref/path]
  if (cleaned.includes("github.com")) {
    const match = cleaned.match(
      /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/,
    );
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
    return {
      owner: match[1],
      repo: match[2],
      ref: match[3] || undefined,
      path: match[4] || undefined,
    };
  }

  // owner/repo shorthand
  const parts = cleaned.split("/");
  if (parts.length >= 2) {
    return {
      owner: parts[0],
      repo: parts[1],
      path: parts.length > 2 ? parts.slice(2).join("/") : undefined,
    };
  }

  throw new Error(`Cannot parse GitHub source: ${url}`);
}

export function createOctokit(token?: string): Octokit {
  return new Octokit(token ? { auth: token } : {});
}

export async function fetchSkillFromGitHub(
  source: GitHubSource,
  token?: string,
): Promise<FetchedSkill> {
  const octokit = createOctokit(token);
  const basePath = source.path ? `${source.path}/` : "";
  const params: { owner: string; repo: string; ref?: string } = {
    owner: source.owner,
    repo: source.repo,
  };
  if (source.ref) params.ref = source.ref;

  // Fetch skill.json
  const manifestResponse = await octokit.repos.getContent({
    ...params,
    path: `${basePath}skill.json`,
  });

  if (!("content" in manifestResponse.data)) {
    throw new Error("skill.json not found or is a directory");
  }

  const manifestRaw = Buffer.from(manifestResponse.data.content, "base64").toString("utf-8");
  const manifest = JSON.parse(manifestRaw) as SkillManifest;

  // Fetch entry file (SKILL.md)
  const entryResponse = await octokit.repos.getContent({
    ...params,
    path: `${basePath}${manifest.entry}`,
  });

  if (!("content" in entryResponse.data)) {
    throw new Error(`Entry file "${manifest.entry}" not found`);
  }

  const entryContent = Buffer.from(entryResponse.data.content, "base64").toString("utf-8");

  // Fetch compact entry if defined
  let compactContent: string | undefined;
  if (manifest.compact_entry) {
    try {
      const compactResponse = await octokit.repos.getContent({
        ...params,
        path: `${basePath}${manifest.compact_entry}`,
      });
      if ("content" in compactResponse.data) {
        compactContent = Buffer.from(compactResponse.data.content, "base64").toString("utf-8");
      }
    } catch {
      // Compact entry is optional
    }
  }

  return { manifest, entryContent, compactContent };
}

// Download full skill directory as files map (for install)
export async function downloadSkillFiles(
  source: GitHubSource,
  token?: string,
): Promise<Map<string, string>> {
  const octokit = createOctokit(token);
  const files = new Map<string, string>();
  const basePath = source.path ?? "";

  async function fetchDir(dirPath: string): Promise<void> {
    const response = await octokit.repos.getContent({
      owner: source.owner,
      repo: source.repo,
      ref: source.ref ?? undefined,
      path: dirPath || ".",
    });

    if (!Array.isArray(response.data)) {
      // Single file
      if ("content" in response.data) {
        const relativePath = basePath
          ? response.data.path.slice(basePath.length + 1)
          : response.data.path;
        files.set(
          relativePath,
          Buffer.from(response.data.content, "base64").toString("utf-8"),
        );
      }
      return;
    }

    for (const item of response.data) {
      if (item.type === "file") {
        const fileResp = await octokit.repos.getContent({
          owner: source.owner,
          repo: source.repo,
          ref: source.ref,
          path: item.path,
        });
        if ("content" in fileResp.data) {
          const relativePath = basePath
            ? fileResp.data.path.slice(basePath.length + 1)
            : fileResp.data.path;
          files.set(
            relativePath,
            Buffer.from(fileResp.data.content, "base64").toString("utf-8"),
          );
        }
      } else if (item.type === "dir") {
        await fetchDir(item.path);
      }
    }
  }

  await fetchDir(basePath);
  return files;
}
