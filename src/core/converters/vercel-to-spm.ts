import type { ParsedSkill, SkillFrontmatter } from "../../types/index.js";

export interface VercelFrontmatter {
  name: string;
  description: string;
  license?: string;
  metadata?: Record<string, unknown>;
  "allowed-tools"?: string[];
  "user-invocable"?: boolean;
  [key: string]: unknown;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "in", "on", "of", "is", "it",
  "with", "that", "this", "use", "when", "how", "what", "your", "you",
]);

export function inferTags(name: string, description: string): string[] {
  const tags = new Set<string>();

  // Extract tokens from name
  for (const token of name.split("-")) {
    if (token.length > 1 && !STOP_WORDS.has(token)) {
      tags.add(token);
    }
  }

  // Extract meaningful words from description
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  for (const word of words.slice(0, 10)) {
    if (tags.size >= 8) break;
    tags.add(word);
  }

  if (tags.size === 0) {
    tags.add(name);
  }

  return [...tags].slice(0, 8);
}

const TOOL_TO_PERMISSION: Record<string, string> = {
  bash: "bash:execute",
  file_read: "file:read",
  file_write: "file:write",
  web_fetch: "network:allowlist",
  terminal: "bash:execute",
  shell: "bash:execute",
};

function mapPermissions(allowedTools?: string[]): string[] {
  if (!allowedTools || allowedTools.length === 0) return [];

  const permissions: string[] = [];
  for (const tool of allowedTools) {
    const normalized = tool.toLowerCase().replace(/-/g, "_");
    const mapped = TOOL_TO_PERMISSION[normalized];
    if (mapped) {
      if (!permissions.includes(mapped)) {
        permissions.push(mapped);
      }
    }
  }
  return permissions;
}

export function isVercelFormat(data: Record<string, unknown>): boolean {
  return !data.schema_version && typeof data.name === "string" && typeof data.description === "string";
}

export function convertVercelToSpm(
  vercel: VercelFrontmatter,
  body: string,
  options: { author: string; license?: string; repository?: string },
): ParsedSkill {
  const name = vercel.name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  const frontmatter: SkillFrontmatter = {
    schema_version: 3,
    name,
    version: "1.0.0",
    author: options.author,
    license: vercel.license || options.license || "MIT",
    description: vercel.description,
    language: "en",
    trigger: {
      description: vercel.description,
      tags: inferTags(name, vercel.description),
      priority: 50,
    },
    security: {
      permissions: mapPermissions(vercel["allowed-tools"]),
    },
  };

  if (options.repository) {
    frontmatter.repository = options.repository;
  }

  return { frontmatter, body: body.trim() };
}
