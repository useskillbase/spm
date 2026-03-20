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
export function getGlobalSkillsDir() {
    return path.join(os.homedir(), SKILLS_DIR_NAME);
}
export function getProjectSkillsDir(cwd) {
    return path.join(cwd, SKILLS_DIR_NAME);
}
export function getInstalledDir(skillsDir) {
    return path.join(skillsDir, INSTALLED_DIR);
}
export function getIndexPath(skillsDir) {
    return path.join(skillsDir, INDEX_FILE);
}
export function getFeedbackPath(skillsDir) {
    return path.join(skillsDir, FEEDBACK_FILE);
}
export function getConfigPath(skillsDir) {
    return path.join(skillsDir, CONFIG_FILE);
}
export function getWorkspaceManifestPath(cwd) {
    return path.join(cwd, WORKSPACE_MANIFEST);
}
export function getSoulMdPath(skillsDir, author, name) {
    return path.join(getInstalledDir(skillsDir), author, name, "SOUL.md");
}
export function getSkillDir(skillsDir, author, skillName) {
    return path.join(getInstalledDir(skillsDir), author, skillName);
}
export function getSkillMdPath(skillsDir, author, skillName) {
    return path.join(getSkillDir(skillsDir, author, skillName), "SKILL.md");
}
export function getConnectionsPath(skillsDir) {
    const dir = skillsDir ?? path.join(os.homedir(), SKILLS_DIR_NAME);
    return path.join(dir, CONNECTIONS_FILE);
}
export function getStatusPortPath(skillsDir) {
    const dir = skillsDir ?? path.join(os.homedir(), SKILLS_DIR_NAME);
    return path.join(dir, STATUS_PORT_FILE);
}
export function getStatusPidPath(skillsDir) {
    const dir = skillsDir ?? path.join(os.homedir(), SKILLS_DIR_NAME);
    return path.join(dir, STATUS_PID_FILE);
}
//# sourceMappingURL=paths.js.map