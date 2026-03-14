import path from "node:path";
import os from "node:os";
const SKILLS_DIR_NAME = ".skills";
const INSTALLED_DIR = "installed";
const INDEX_FILE = "index.json";
const FEEDBACK_FILE = "feedback.json";
const CONFIG_FILE = "config.json";
const MANIFEST_FILE = "skill.json";
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
export function getManifestPath(cwd) {
    return path.join(cwd, MANIFEST_FILE);
}
//# sourceMappingURL=paths.js.map