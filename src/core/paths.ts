import path from "node:path";
import os from "node:os";

const SKILLS_DIR_NAME = ".spm";
const INSTALLED_DIR = "installed";
const INDEX_FILE = "index.json";
const FEEDBACK_FILE = "feedback.json";
const CONFIG_FILE = "config.json";
const CONNECTIONS_FILE = "connections.json";
const STATUS_PORT_FILE = "status.port";
const STATUS_PID_FILE = "status.pid";
const WORKSPACE_MANIFEST = "skillbase.json";
const SKILLBASE_DIR = ".skillbase";
const SYNC_JSON = "sync.json";


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

export function getWorkspaceManifestPath(cwd: string): string {
  return path.join(cwd, WORKSPACE_MANIFEST);
}


export function getSoulMdPath(skillsDir: string, author: string, name: string): string {
  return path.join(getInstalledDir(skillsDir), author, name, "SOUL.md");
}

export function getSkillDir(skillsDir: string, author: string, skillName: string): string {
  return path.join(getInstalledDir(skillsDir), author, skillName);
}

export function getSkillMdPath(skillsDir: string, author: string, skillName: string): string {
  return path.join(getSkillDir(skillsDir, author, skillName), "SKILL.md");
}

export function getConnectionsPath(skillsDir?: string): string {
  const dir = skillsDir ?? path.join(os.homedir(), SKILLS_DIR_NAME);
  return path.join(dir, CONNECTIONS_FILE);
}

export function getStatusPortPath(skillsDir?: string): string {
  const dir = skillsDir ?? path.join(os.homedir(), SKILLS_DIR_NAME);
  return path.join(dir, STATUS_PORT_FILE);
}

export function getStatusPidPath(skillsDir?: string): string {
  const dir = skillsDir ?? path.join(os.homedir(), SKILLS_DIR_NAME);
  return path.join(dir, STATUS_PID_FILE);
}

export function getSkillbaseDir(cwd: string): string {
  return path.join(cwd, SKILLBASE_DIR);
}

export function getSyncJsonPath(cwd: string): string {
  return path.join(cwd, SKILLBASE_DIR, SYNC_JSON);
}
