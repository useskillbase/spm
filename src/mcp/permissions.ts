import path from "node:path";
import type { LoadedSkillSession } from "../types/index.js";

// ── Types ───────────────────────────────────────────────────────────

export interface PermissionCheck {
  allowed: boolean;
  reason: string;
  /** Name of the skill that granted or was checked for the permission. */
  skill?: string;
}

export interface AuditEntry {
  timestamp: string;
  skill: string;
  tool: string;
  action: string;
  allowed: boolean;
  reason: string;
}

// ── Audit log (in-memory, per server lifetime) ──────────────────────

const auditLog: AuditEntry[] = [];

export function recordAudit(entry: AuditEntry): void {
  auditLog.push(entry);
}

export function getAuditLog(): readonly AuditEntry[] {
  return auditLog;
}

export function clearAuditLog(): void {
  auditLog.length = 0;
}

// ── Permission checking ─────────────────────────────────────────────

/**
 * Checks whether the currently loaded skills grant the required permission.
 *
 * Permissions are aggregated (union) across all loaded skills.
 * If `filePath` is provided and any granting skill declares `file_scope`,
 * the resolved path must fall within at least one scope entry.
 */
export function checkPermission(
  skills: readonly LoadedSkillSession[],
  required: string,
  filePath?: string,
): PermissionCheck {
  if (skills.length === 0) {
    return { allowed: false, reason: "No skills loaded" };
  }

  // Find all skills that grant the required permission
  const grantingSkills = skills.filter(
    (s) => s.permissions.includes("tool:*") || s.permissions.includes(required),
  );

  if (grantingSkills.length === 0) {
    const skillNames = skills.map((s) => s.name).join(", ");
    return {
      allowed: false,
      reason: `Permission "${required}" not granted by loaded skills: ${skillNames}`,
      skill: skills[0].name,
    };
  }

  // If a file path is provided, validate against file_scope
  if (filePath !== undefined) {
    const scopeCheck = checkFileScope(grantingSkills, filePath);
    if (!scopeCheck.allowed) {
      return scopeCheck;
    }
  }

  return {
    allowed: true,
    reason: `Permission "${required}" granted`,
    skill: grantingSkills[0].name,
  };
}

/**
 * Validates that a file path falls within at least one granting skill's file_scope.
 * If no granting skill declares file_scope, access is unrestricted.
 */
function checkFileScope(
  grantingSkills: readonly LoadedSkillSession[],
  filePath: string,
): PermissionCheck {
  const resolved = path.resolve(filePath);

  // Collect all file_scope entries from granting skills
  const allScopes: string[] = [];
  let anyScopesDeclared = false;

  for (const skill of grantingSkills) {
    if (skill.file_scope && skill.file_scope.length > 0) {
      anyScopesDeclared = true;
      allScopes.push(...skill.file_scope);
    }
  }

  // No file_scope declared → unrestricted
  if (!anyScopesDeclared) {
    return { allowed: true, reason: "No file_scope restrictions" };
  }

  // Check if resolved path starts with any allowed scope
  for (const scope of allScopes) {
    const resolvedScope = path.resolve(scope);
    if (resolved === resolvedScope || resolved.startsWith(resolvedScope + path.sep)) {
      return {
        allowed: true,
        reason: `Path within file_scope: ${scope}`,
        skill: grantingSkills[0].name,
      };
    }
  }

  return {
    allowed: false,
    reason: `Path "${resolved}" is outside allowed file_scope: ${allScopes.join(", ")}`,
    skill: grantingSkills[0].name,
  };
}

// ── Policy text generation ──────────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  "file:read": "read files",
  "file:write": "write files",
  "file:delete": "delete files",
  "bash:execute": "bash execution",
  "network:allowlist": "network access",
  "network:none": "no network access",
  "tool:*": "all tool operations",
};

const PROXY_TOOLS: Array<{
  permission: string;
  tool: string;
  nativeAlternatives: string;
}> = [
  { permission: "file:read", tool: "skill_exec_read", nativeAlternatives: "Read / cat" },
  { permission: "file:write", tool: "skill_exec_write", nativeAlternatives: "Write / echo" },
  { permission: "bash:execute", tool: "skill_exec_bash", nativeAlternatives: "Bash" },
  { permission: "network:allowlist", tool: "skill_exec_fetch", nativeAlternatives: "fetch / curl" },
];

/**
 * Generates a policy block to inject into skill_load responses.
 * Tells the model which proxy tools to use and which are denied.
 */
export function buildPolicyBlock(permissions: string[]): string {
  const permSet = new Set(permissions);
  const hasWildcard = permSet.has("tool:*");

  const authorized = permissions
    .map((p) => PERMISSION_LABELS[p] ?? p)
    .filter(Boolean);

  const lines: string[] = [
    "<SKILL_POLICY>",
    `This skill declares permissions: ${permissions.join(", ")}`,
    `Authorized actions: ${authorized.join(", ")}`,
    "",
    "When executing tasks for this skill, use the permission-enforced tools:",
  ];

  for (const pt of PROXY_TOOLS) {
    const allowed = hasWildcard || permSet.has(pt.permission);
    const status = allowed ? "USE THIS" : "DENIED for this skill";
    lines.push(`- ${pt.tool} instead of ${pt.nativeAlternatives} (${status})`);
  }

  lines.push("");
  lines.push("These tools enforce the skill's declared permissions. Using native tools bypasses security controls.");
  lines.push("</SKILL_POLICY>");

  return lines.join("\n");
}
