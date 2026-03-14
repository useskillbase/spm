import path from "node:path";
import os from "node:os";

const SKILLS_DIR_NAME = ".skills";
const INSTALLED_DIR = "installed";
const PERSONAS_DIR = "personas";
const INDEX_FILE = "index.json";
const FEEDBACK_FILE = "feedback.json";
const CONFIG_FILE = "config.json";
const MANIFEST_FILE = "skill.json";

export function getGlobalSkillsDir(): string {
  return path.join(os.homedir(), SKILLS_DIR_NAME);
}

export function getProjectSkillsDir(cwd: string): string {
  return path.join(cwd, SKILLS_DIR_NAME);
}

export function getInstalledDir(skillsDir: string): string {
  return path.join(skillsDir, INSTALLED_DIR);
}

export function getIndexPath(skillsDir: string): string {
  return path.join(skillsDir, INDEX_FILE);
}

export function getFeedbackPath(skillsDir: string): string {
  return path.join(skillsDir, FEEDBACK_FILE);
}

export function getConfigPath(skillsDir: string): string {
  return path.join(skillsDir, CONFIG_FILE);
}

export function getManifestPath(cwd: string): string {
  return path.join(cwd, MANIFEST_FILE);
}

export function getPersonasDir(skillsDir: string): string {
  return path.join(skillsDir, PERSONAS_DIR);
}

export function getPersonaPath(skillsDir: string, name: string): string {
  return path.join(skillsDir, PERSONAS_DIR, `${name}.person.json`);
}
