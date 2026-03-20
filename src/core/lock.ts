import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getInstalledDir } from "./paths.js";
import { parseSkill } from "./skill-parser.js";
import type { SkillsLock, LockSkillEntry } from "../types/index.js";

async function hashDirectory(dir: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const entries = await fs.readdir(dir, { recursive: true });
  entries.sort();

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.toString());
    const stat = await fs.stat(fullPath);
    if (stat.isFile()) {
      const content = await fs.readFile(fullPath);
      hash.update(content);
    }
  }

  return hash.digest("hex");
}

export async function buildLock(skillsDir: string): Promise<SkillsLock> {
  const installedDir = getInstalledDir(skillsDir);
  const lock: SkillsLock = {
    lock_version: 1,
    generated: new Date().toISOString(),
    total_tokens_estimate: 0,
    skills: {},
  };

  let scopes: string[];
  try {
    scopes = await fs.readdir(installedDir);
  } catch {
    return lock;
  }

  for (const author of scopes) {
    const authorDir = path.join(installedDir, author);
    const stat = await fs.stat(authorDir);
    if (!stat.isDirectory()) continue;

    const skillNames = await fs.readdir(authorDir);
    for (const skillName of skillNames) {
      const skillDir = path.join(authorDir, skillName);
      const skillStat = await fs.stat(skillDir);
      if (!skillStat.isDirectory()) continue;

      const skillMdPath = path.join(skillDir, "SKILL.md");
      let name: string;
      let version: string;
      let dependencies: Record<string, string>;
      let bodyLength: number;

      try {
        const raw = await fs.readFile(skillMdPath, "utf-8");
        const parsed = parseSkill(raw);
        name = parsed.frontmatter.name;
        version = parsed.frontmatter.version;
        dependencies = parsed.frontmatter.dependencies ?? {};
        bodyLength = parsed.body.length;
      } catch {
        continue;
      }

      const integrity = await hashDirectory(skillDir);
      const tokensEstimate = Math.ceil(bodyLength / 4);

      const entry: LockSkillEntry = {
        version,
        resolved: skillDir,
        integrity: `sha256-${integrity}`,
        tokens_estimate: tokensEstimate,
        dependencies,
      };

      lock.skills[`${author}/${name}`] = entry;
      lock.total_tokens_estimate += tokensEstimate;
    }
  }

  return lock;
}

export async function writeLock(skillsDir: string): Promise<SkillsLock> {
  const lock = await buildLock(skillsDir);
  const lockPath = path.join(skillsDir, "skills.lock");
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2), "utf-8");
  return lock;
}
