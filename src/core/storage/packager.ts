import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { pack, extract } from "tar-stream";
import type { SkillManifest } from "../../types/index.js";

export interface PackageResult {
  data: Buffer;
  integrity: string;
  size: number;
  filesCount: number;
}

const IGNORED_PATTERNS = [
  "node_modules",
  ".git",
  ".DS_Store",
  "Thumbs.db",
];

const SENSITIVE_PATTERNS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.jks",
  "*.keystore",
  ".aws",
  ".ssh",
  ".npmrc",
  ".docker",
  "credentials.json",
  "service-account*.json",
  "*.secret",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  "id_dsa",
];

function matchesGlob(name: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    return name.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    const dotIdx = name.indexOf(".");
    return dotIdx >= 0 && name.slice(0, dotIdx) === prefix;
  }
  if (pattern.endsWith("*")) {
    return name.startsWith(pattern.slice(0, -1));
  }
  return name === pattern;
}

function isSensitive(relativePath: string): boolean {
  const parts = relativePath.split("/");
  const fileName = parts[parts.length - 1];

  for (const pattern of SENSITIVE_PATTERNS) {
    if (matchesGlob(fileName, pattern)) return true;
    if (parts.some((p) => matchesGlob(p, pattern))) return true;
  }
  return false;
}

async function loadSkillIgnore(skillDir: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(skillDir, ".skillignore"), "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch {
    return [];
  }
}

function shouldInclude(relativePath: string, extraIgnore: string[]): boolean {
  const parts = relativePath.split(path.sep);

  if (parts.some((p) => IGNORED_PATTERNS.includes(p))) return false;

  if (isSensitive(relativePath)) return false;

  for (const pattern of extraIgnore) {
    const fileName = parts[parts.length - 1];
    if (matchesGlob(fileName, pattern)) return false;
    if (parts.some((p) => matchesGlob(p, pattern))) return false;
  }

  return true;
}

async function collectFiles(
  dir: string,
  extraIgnore: string[],
  base = "",
): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);

    if (!shouldInclude(relativePath, extraIgnore)) continue;

    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath, extraIgnore, relativePath);
      for (const [k, v] of subFiles) {
        files.set(k, v);
      }
    } else if (entry.isFile()) {
      files.set(relativePath, await fs.readFile(fullPath));
    }
    // Symlinks are intentionally skipped
  }

  return files;
}

export async function packSkill(skillDir: string): Promise<PackageResult> {
  const manifestPath = path.join(skillDir, "skill.json");
  const manifestRaw = await fs.readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestRaw) as SkillManifest;

  const extraIgnore = await loadSkillIgnore(skillDir);
  const files = await collectFiles(skillDir, extraIgnore);

  // Ensure skill.json is included
  if (!files.has("skill.json")) {
    files.set("skill.json", Buffer.from(manifestRaw, "utf-8"));
  }

  const tarPack = pack();
  const chunks: Buffer[] = [];

  const gzip = createGzip({ level: 9 });

  const collectPromise = new Promise<Buffer>((resolve, reject) => {
    const bufs: Buffer[] = [];
    gzip.on("data", (chunk: Buffer) => bufs.push(chunk));
    gzip.on("end", () => resolve(Buffer.concat(bufs)));
    gzip.on("error", reject);
  });

  tarPack.pipe(gzip);

  for (const [name, content] of files) {
    tarPack.entry({ name, size: content.length }, content);
  }
  tarPack.finalize();

  const data = await collectPromise;
  const hash = crypto.createHash("sha256").update(data).digest("hex");

  return {
    data,
    integrity: `sha256-${hash}`,
    size: data.length,
    filesCount: files.size,
  };
}

function isPathSafe(entryName: string, destDir: string): boolean {
  const resolved = path.resolve(destDir, entryName);
  const resolvedDest = path.resolve(destDir);
  return resolved.startsWith(resolvedDest + path.sep) || resolved === resolvedDest;
}

export async function unpackSkill(data: Buffer, destDir: string): Promise<string[]> {
  await fs.mkdir(destDir, { recursive: true });

  const extractedFiles: string[] = [];
  const gunzip = createGunzip();
  const extractor = extract();

  const extractPromise = new Promise<void>((resolve, reject) => {
    extractor.on("entry", async (header, stream, next) => {
      if (!isPathSafe(header.name, destDir)) {
        stream.resume();
        next();
        return;
      }

      const filePath = path.resolve(destDir, header.name);

      if (header.type === "directory") {
        await fs.mkdir(filePath, { recursive: true });
        stream.resume();
        next();
        return;
      }

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", async () => {
        await fs.writeFile(filePath, Buffer.concat(chunks));
        extractedFiles.push(header.name);
        next();
      });
      stream.on("error", reject);
    });

    extractor.on("finish", resolve);
    extractor.on("error", reject);
  });

  gunzip.pipe(extractor);
  gunzip.end(data);

  await extractPromise;

  return extractedFiles;
}

export function computeIntegrity(data: Buffer): string {
  return `sha256-${crypto.createHash("sha256").update(data).digest("hex")}`;
}
