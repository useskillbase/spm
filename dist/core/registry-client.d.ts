import type { SkillsConfig, RemoteSkillEntry, RegistrySearchResult, SkillManifest } from "../types/index.js";
export interface PublishResult {
    published: boolean;
    name: string;
    version: string;
    updated: boolean;
    size?: number;
}
export interface DownloadResult {
    name: string;
    version: string;
    manifest: Record<string, unknown>;
    integrity: string | null;
    tokens_estimate: number;
    download_url: string;
}
export declare class RegistryClient {
    private readonly url;
    private readonly token?;
    constructor(url: string, token?: string | undefined);
    private headers;
    private skillUrl;
    search(query?: string, tag?: string, page?: number): Promise<RegistrySearchResult>;
    getSkill(author: string, name: string): Promise<RemoteSkillEntry | null>;
    getContent(author: string, name: string, version?: string): Promise<{
        name: string;
        version: string;
        content: string;
        manifest: SkillManifest;
        integrity: string;
        tokens_estimate: number;
    }>;
    publish(body: {
        manifest: SkillManifest;
        content: string;
        compact_content?: string;
        source?: {
            type: "github";
            url: string;
            ref?: string;
            path?: string;
        };
    }): Promise<PublishResult>;
    publishWithArchive(metadata: {
        manifest: SkillManifest;
        content: string;
        compact_content?: string;
    }, archive: Buffer): Promise<PublishResult>;
    getDownloadUrl(author: string, name: string, version?: string): Promise<DownloadResult>;
    getVersions(author: string, name: string): Promise<{
        version: string;
        created_at: string;
    }[]>;
    startDeviceAuth(): Promise<{
        session_id: string;
        user_code: string;
        verification_uri: string;
        interval: number;
    }>;
    pollDeviceAuth(sessionId: string): Promise<{
        status: string;
        interval?: number;
        author?: {
            id: number;
            name: string;
        };
        token?: string;
    }>;
    register(name: string, githubUsername?: string): Promise<{
        author: {
            id: number;
            name: string;
        };
        token: string;
    }>;
    sendFeedback(author: string, skillName: string, result: string, comment?: string): Promise<void>;
}
export declare function createRegistryClients(config: SkillsConfig): Map<string, RegistryClient>;
export declare function getClientForSkill(config: SkillsConfig, _skillRef: string): RegistryClient | null;
//# sourceMappingURL=registry-client.d.ts.map