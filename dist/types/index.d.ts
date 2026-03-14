export interface SkillTrigger {
    description: string;
    tags: string[];
    file_patterns?: string[];
    priority: number;
}
export interface SkillDependencies {
    [name: string]: string;
}
export interface SkillCompatibility {
    min_context_tokens: number;
    requires: string[];
    models: string[];
}
export interface SkillFiles {
    reference?: string[];
    examples?: string[];
    assets?: string[];
    tests?: string[];
}
export interface SkillWorksWithEntry {
    skill: string;
    relationship: "input" | "output" | "parallel";
    description: string;
}
export interface SkillSecurity {
    permissions: string[];
    file_scope?: string[];
    integrity?: string;
}
export interface SkillQuality {
    usage_count: number;
    success_rate: number;
    avg_rating: number;
    confidence: number;
}
export interface SkillManifest {
    schema_version: number;
    name: string;
    version: string;
    language?: string;
    description: string;
    trigger?: SkillTrigger;
    dependencies: SkillDependencies;
    compatibility?: SkillCompatibility;
    entry?: string;
    compact_entry?: string;
    files?: SkillFiles;
    works_with?: SkillWorksWithEntry[];
    security?: SkillSecurity;
    quality?: SkillQuality;
    author: string;
    license: string;
    repository?: string;
}
export interface IndexSkillEntry {
    name: string;
    v: string;
    trigger: string;
    tags: string[];
    file_patterns?: string[];
    priority: number;
    entry: string;
    compact_entry?: string;
    tokens_estimate: number;
}
export interface SkillIndex {
    version: string;
    skills: IndexSkillEntry[];
}
export interface LockSkillEntry {
    version: string;
    resolved: string;
    integrity: string;
    tokens_estimate: number;
    dependencies: SkillDependencies;
}
export interface SkillsLock {
    lock_version: number;
    generated: string;
    total_tokens_estimate: number;
    skills: Record<string, LockSkillEntry>;
}
export type FeedbackResult = "success" | "partial" | "failure" | "false_trigger";
export type FeedbackType = "automatic" | "explicit";
export interface FeedbackContext {
    task_type?: string;
    file_types?: string[];
    tokens_used?: number;
}
export interface FeedbackEntry {
    skill: string;
    version: string;
    timestamp: string;
    type: FeedbackType;
    result: FeedbackResult;
    rating?: number;
    comment?: string;
    context?: FeedbackContext;
}
export interface FeedbackStore {
    entries: FeedbackEntry[];
}
export interface SkillStats {
    skill: string;
    usage_count: number;
    success_rate: number;
    avg_rating: number | null;
    confidence: number;
}
export interface FeedbackConfig {
    enabled: boolean;
    automatic: boolean;
}
export interface ToolsConfig {
    skill_list: boolean;
    skill_load: boolean;
    skill_context: boolean;
    skill_feedback: boolean;
    skill_search: boolean;
    skill_install: boolean;
    persona_load: boolean;
    persona_list: boolean;
}
export interface SearchConfig {
    remote_enabled: boolean;
    auto_suggest: boolean;
}
export interface RegistryEntry {
    name: string;
    url: string;
    token?: string;
}
export interface SkillsConfig {
    feedback: FeedbackConfig;
    tools: ToolsConfig;
    search: SearchConfig;
    registries: RegistryEntry[];
    scopes: Record<string, string>;
    active_persona?: string | null;
    github?: {
        token?: string;
    };
}
export interface RemoteSkillEntry {
    name: string;
    version: string;
    description: string;
    author: string;
    license: string;
    repository?: string;
    trigger: {
        description: string;
        tags: string[];
        file_patterns?: string[];
        priority: number;
    };
    tokens_estimate: number;
    installs: number;
    avg_rating: number | null;
    confidence: number | null;
    safety_status: string;
    safety_score: number | null;
    created_at: string;
    updated_at: string;
}
export interface PublishRequest {
    manifest: SkillManifest;
    content: string;
    compact_content?: string;
    files?: Record<string, string>;
    source: {
        type: "upload" | "github";
        github_url?: string;
        github_ref?: string;
        github_path?: string;
    };
}
export interface RegistrySearchResult {
    skills: RemoteSkillEntry[];
    total: number;
    page: number;
    per_page: number;
}
export interface PersonaCharacter {
    role: string;
    tone?: string;
    guidelines?: string[];
    instructions?: string;
}
export interface PersonaSettings {
    temperature?: number;
    top_p?: number;
    [key: string]: number | undefined;
}
export interface PersonaManifest {
    schema_version: number;
    name: string;
    version: string;
    description: string;
    author: string;
    license: string;
    skills?: SkillDependencies;
    character: PersonaCharacter;
    settings?: PersonaSettings;
}
export interface LoadedSkill {
    name: string;
    version: string;
    content: string;
    permissions: string[];
    tokens_estimate: number;
    works_with?: SkillWorksWithEntry[];
    confidence?: number | null;
}
//# sourceMappingURL=index.d.ts.map