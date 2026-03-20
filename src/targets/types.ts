import type { ParsedSoul, LegacyPersonaManifest, LoadedSkill } from "../types/index.js";

export interface ExportOptions {
  outputDir: string;
  overwrite?: boolean;
}

export interface ExportResult {
  outputDir: string;
  files: string[];
  dockerFragment?: string;
}

export interface DeployOptions {
  agentId: string;
  bindChannel?: string;
  bindAccountId?: string;
  configPath?: string;
  overwrite?: boolean;
}

export interface DeployResult {
  agentId: string;
  workspaceDir: string;
  configUpdated: boolean;
  bindingAdded: boolean;
  dockerFragment?: string;
}

export interface RemoteDeployOptions {
  connectionName?: string;
}

export interface RemoteDeployResult {
  connectionName: string;
  url: string;
  success: boolean;
  message?: string;
}

export interface DeployTarget {
  id: string;
  name: string;
  export(
    persona: ParsedSoul,
    skills: LoadedSkill[],
    options: ExportOptions,
  ): Promise<ExportResult>;
  deploy(
    persona: ParsedSoul,
    skills: LoadedSkill[],
    options: DeployOptions,
  ): Promise<DeployResult>;
  import?(sourcePath: string): Promise<LegacyPersonaManifest>;
  remoteDeploy?(
    persona: ParsedSoul,
    skills: LoadedSkill[],
    options: RemoteDeployOptions,
  ): Promise<RemoteDeployResult>;
}
