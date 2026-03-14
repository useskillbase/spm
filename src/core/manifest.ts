import fs from "node:fs/promises";
import { getManifestPath } from "./paths.js";
import type { SkillManifest } from "../types/index.js";

export function getDefaultManifest(): SkillManifest {
  return {
    schema_version: 1,
    name: "my-project",
    version: "1.0.0",
    description: "Project skill bundle",
    dependencies: {},
    author: "",
    license: "MIT",
  };
}

export async function readManifest(cwd: string): Promise<SkillManifest | null> {
  const manifestPath = getManifestPath(cwd);
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as SkillManifest;
  } catch {
    return null;
  }
}

export async function writeManifest(cwd: string, manifest: SkillManifest): Promise<void> {
  const manifestPath = getManifestPath(cwd);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

export async function addDependency(cwd: string, skillRef: string, version: string): Promise<void> {
  const manifest = (await readManifest(cwd)) ?? getDefaultManifest();
  manifest.dependencies[skillRef] = `^${version}`;
  await writeManifest(cwd, manifest);
}
