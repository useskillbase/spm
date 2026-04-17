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
export interface SkillFrontmatter {
    schema_version: number;
    name: string;
    version: string;
    author: string;
    license: string;
    description: string;
    language?: string;
    trigger?: SkillTrigger;
    security?: SkillSecurity;
    dependencies?: SkillDependencies;
    compatibility?: SkillCompatibility;
    works_with?: SkillWorksWithEntry[];
    docs?: SkillDocs;
    repository?: string;
}
export interface SkillDocs {
    sources: DocSource[];
    delivery?: "local" | "remote" | "auto";
    priority_pages?: string[];
}
export interface DocSource {
    type: "url" | "llms-txt" | "github";
    url: string;
    scope?: "crawl" | "page" | "sitemap";
    depth?: number;
    include?: string[];
    exclude?: string[];
    label?: string;
}
export interface ParsedSkill {
    frontmatter: SkillFrontmatter;
    body: string;
}
export interface LegacySkillManifest {
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
    files?: {
        reference?: string[];
        examples?: string[];
        assets?: string[];
        tests?: string[];
    };
    works_with?: SkillWorksWithEntry[];
    security?: SkillSecurity;
    quality?: {
        usage_count: number;
        success_rate: number;
        avg_rating: number;
        confidence: number;
    };
    author: string;
    license: string;
    repository?: string;
    docs?: SkillDocs;
}
/** @deprecated Use SkillFrontmatter instead */
export type SkillManifest = LegacySkillManifest;
export interface SoulSkillbaseBlock {
    schema_version: number;
    trigger?: SkillTrigger;
    skills?: SkillDependencies;
    knowledge_scope?: {
        built_in?: string[];
        requires_user_context?: string[];
    };
    context_slot?: {
        placeholder: string;
        required: boolean;
        example?: string;
    };
    constraints?: {
        never?: string[];
        always?: string[];
    };
    avatar?: {
        seed?: number;
        prompt?: string;
        model_hint?: string;
        via_mcp?: string;
    };
    voice?: {
        provider_hint?: string;
        voice_id?: string;
        speaking_style?: string;
        via_mcp?: string;
    };
    animation?: {
        mode?: string;
        via_mcp?: string;
        required?: boolean;
    };
    mcp_servers?: Record<string, {
        description?: string;
        tool?: string;
        required?: boolean;
        fallback?: string;
    }>;
    settings?: {
        temperature?: number;
        top_p?: number;
        [key: string]: number | undefined;
    };
}
export interface SoulFrontmatter {
    name: string;
    version: string;
    author: string;
    license: string;
    description: string;
    skillbase?: SoulSkillbaseBlock;
}
export interface ParsedSoul {
    frontmatter: SoulFrontmatter;
    body: string;
}
export interface PersonaCharacter {
    role: string;
    tone?: string;
    guidelines?: string[];
    instructions?: string;
}
export interface LegacyPersonaManifest {
    schema_version: number;
    name: string;
    version: string;
    description: string;
    author: string;
    license: string;
    skills?: SkillDependencies;
    character: PersonaCharacter;
    settings?: {
        temperature?: number;
        top_p?: number;
        [key: string]: number | undefined;
    };
}
/** @deprecated Use SoulFrontmatter instead */
export type PersonaManifest = LegacyPersonaManifest;
export type PersonaSettings = LegacyPersonaManifest["settings"];
export interface IndexSkillEntry {
    name: string;
    v: string;
    trigger: string;
    tags: string[];
    file_patterns?: string[];
    priority: number;
    entry: string;
    tokens_estimate: number;
    package_type?: "skill" | "persona";
}
export interface SkillIndex {
    version: string;
    skills: IndexSkillEntry[];
}
export interface WorkspaceManifest {
    schema_version: number;
    name: string;
    version: string;
    skills?: SkillDependencies;
    personas?: SkillDependencies;
    registry?: string;
    spm?: {
        default_instance?: string;
    };
}
export type FeedbackResult = "success" | "partial" | "failure" | "false_trigger" | "violation";
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
    persona_install: boolean;
    skill_exec: boolean;
    sync_status: boolean;
    sync_environment: boolean;
    sync_install: boolean;
    sync_project_prompt: boolean;
    sync_feature_load: boolean;
    sync_feature_update: boolean;
    sync_feature_diff: boolean;
    sync_search: boolean;
}
export interface SearchConfig {
    remote_enabled: boolean;
    auto_suggest: boolean;
}
export interface RegistryEntry {
    name: string;
    url: string;
    token?: string;
    author_name?: string;
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
    sync?: SyncConfig;
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
    visibility?: "public" | "private";
    created_at: string;
    updated_at: string;
}
export interface MineSkillEntry {
    name: string;
    version: string;
    description: string;
    package_type: "skill" | "persona";
    visibility: "public" | "private";
    installs: number;
    views: number;
    updated_at: string;
}
export interface MineSkillsResult {
    skills: MineSkillEntry[];
    total: number;
    page: number;
    per_page: number;
}
export interface PublishRequest {
    content: string;
    source?: {
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
export interface LoadedSkill {
    name: string;
    version: string;
    content: string;
    permissions: string[];
    file_scope?: string[];
    tokens_estimate: number;
    works_with?: SkillWorksWithEntry[];
    confidence?: number | null;
    /** Relative paths of supporting files bundled with the skill (scripts, configs, etc.) */
    files?: string[];
    /** Absolute path to the skill's installation directory */
    install_path?: string;
}
export interface LoadedSkillSession {
    name: string;
    version: string;
    tokens: number;
    permissions: string[];
    file_scope?: string[];
}
export interface SyncJson {
    company: string;
    project_id: string;
    project_slug: string;
}
export interface SyncConnection {
    company: string;
    api: string;
    key: string;
    project_id?: string;
    connected_at: string;
}
export interface SyncConfig {
    connections: SyncConnection[];
    active_connection?: string;
}
export interface SyncProjectListItem {
    id: string;
    slug: string;
    name: string;
    knowledgeUpdateMode: "auto" | "confirm";
    createdAt: string;
    updatedAt: string;
    featureCount: number;
}
export interface SyncManifest {
    project: {
        id: string;
        slug: string;
        name: string;
        knowledgeUpdateMode: "auto" | "confirm";
    };
    skills: Array<{
        skillName: string;
        skillVersion: string;
    }>;
    personas: Array<{
        personaName: string;
        personaVersion: string;
    }>;
}
export interface SyncProjectPrompt {
    promptContent: string | null;
    promptVersion: number;
    conventions: Record<string, unknown>;
}
export interface SyncKnowledgeSummary {
    [type: string]: {
        count: number;
        latest?: string;
        unresolved?: number;
    };
}
export interface SyncFeatureMap {
    feature: {
        id: string;
        slug: string;
        title: string;
        status: string;
        version: number;
        updatedAt: string;
        descriptionPreview: string | null;
        links: unknown[];
    };
    knowledgeSummary: SyncKnowledgeSummary;
    projectPromptVersion: number;
}
export interface SyncKnowledgeItem {
    id: string;
    type: string;
    content: string;
    reason: string | null;
    metadata: Record<string, unknown>;
    resolved: boolean;
    featureVersion: number;
    createdAt: string;
    updatedAt: string;
}
export interface SyncFeatureDiff {
    fromVersion: number;
    toVersion: number;
    changes: Array<{
        version: number;
        changes: unknown;
        authorUsername: string;
        authorSource: string;
        createdAt: string;
    }>;
}
export interface SyncContextOperation {
    action: "add" | "update" | "remove" | "update_description";
    type?: string;
    content?: string;
    reason?: string;
    id?: string;
    resolved?: boolean;
    metadata?: Record<string, unknown>;
    description?: string;
}
export interface SyncPushResult {
    version: number;
    appliedOperations: number;
}
export interface SyncFeatureListItem {
    id: string;
    slug: string;
    title: string;
    status: string;
    version: number;
    updatedAt: string;
    descriptionPreview: string | null;
}
export interface SyncSearchResult {
    features: Array<{
        id: string;
        slug: string;
        title: string;
        status: string;
        description_preview: string | null;
        rank: number;
    }>;
    knowledgeItems: Array<{
        id: string;
        type: string;
        content: string;
        reason: string | null;
        feature_id: string;
        feature_slug: string;
        feature_title: string;
        rank: number;
    }>;
}
//# sourceMappingURL=index.d.ts.map