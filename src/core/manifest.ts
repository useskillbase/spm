import fs from "node:fs/promises";
import { getWorkspaceManifestPath } from "./paths.js";
import type { WorkspaceManifest } from "../types/index.js";

export function getDefaultWorkspaceManifest(): WorkspaceManifest {
  return {
    schema_version: 1,
    name: "my-project",
    version: "1.0.0",
    skills: {},
    personas: {},
  };
}

export async function readWorkspaceManifest(cwd: string): Promise<WorkspaceManifest | null> {
  const manifestPath = getWorkspaceManifestPath(cwd);
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as WorkspaceManifest;
  } catch {
    return null;
  }
}

export async function writeWorkspaceManifest(cwd: string, manifest: WorkspaceManifest): Promise<void> {
  const manifestPath = getWorkspaceManifestPath(cwd);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}

export async function addSkillDependency(
  cwd: string,
  skillRef: string,
  version: string,
): Promise<void> {
  const manifest = (await readWorkspaceManifest(cwd)) ?? getDefaultWorkspaceManifest();
  if (!manifest.skills) manifest.skills = {};
  manifest.skills[skillRef] = `^${version}`;
  await writeWorkspaceManifest(cwd, manifest);
}

export async function removeSkillDependency(
  cwd: string,
  skillRef: string,
): Promise<boolean> {
  const manifest = await readWorkspaceManifest(cwd);
  if (!manifest?.skills?.[skillRef]) return false;
  delete manifest.skills[skillRef];
  await writeWorkspaceManifest(cwd, manifest);
  return true;
}

export async function addPersonaDependency(
  cwd: string,
  personaRef: string,
  version: string,
): Promise<void> {
  const manifest = (await readWorkspaceManifest(cwd)) ?? getDefaultWorkspaceManifest();
  if (!manifest.personas) manifest.personas = {};
  manifest.personas[personaRef] = `^${version}`;
  await writeWorkspaceManifest(cwd, manifest);
}

/** @deprecated Use addSkillDependency */
export async function addDependency(cwd: string, skillRef: string, version: string): Promise<void> {
  return addSkillDependency(cwd, skillRef, version);
}
