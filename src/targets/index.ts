import type { DeployTarget } from "./types.js";
import { openclawTarget } from "./openclaw.js";

const targets = new Map<string, DeployTarget>();
targets.set("openclaw", openclawTarget);

export function getTarget(id: string): DeployTarget | undefined {
  return targets.get(id);
}

export function getAllTargets(): DeployTarget[] {
  return Array.from(targets.values());
}

export function getAllTargetIds(): string[] {
  return Array.from(targets.keys());
}

export type { DeployTarget, ExportOptions, ExportResult, DeployOptions, DeployResult } from "./types.js";
