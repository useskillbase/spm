export interface ServerValueArgs {
  /** Absolute path to the node binary */
  execPath: string;
  /** Absolute path to the spm entry script */
  binPath: string;
}

export interface ClientDefinition {
  /** CLI key, e.g. "claude", "cursor" */
  id: string;
  /** Display name, e.g. "Claude Desktop" */
  name: string;
  /** CLI aliases, e.g. ["jb"] for jetbrains */
  aliases?: string[];
  /** Absolute path to config file (platform-aware) */
  configPath: string;
  /** JSON path segments to the server entry, e.g. ["mcpServers", "spm"] */
  jsonPath: string[];
  /** Extra fields merged into serverValue (e.g. { type: "stdio" } for VS Code) */
  extraFields?: Record<string, unknown>;
  /** Override the entire server value (for clients with non-standard format like OpenCode) */
  buildServerValue?: (args: ServerValueArgs) => Record<string, unknown>;
}
