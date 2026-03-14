import type {
  SkillsConfig,
  RemoteSkillEntry,
  RegistrySearchResult,
  SkillManifest,
} from "../types/index.js";

// HTTP client for communicating with remote registry servers.

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
  download_url: string; // Presigned URL from storage provider
}

export class RegistryClient {
  constructor(
    private readonly url: string,
    private readonly token?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }

  private skillUrl(author: string, name: string): string {
    return `${this.url}/api/skills/${author}/${name}`;
  }

  async search(query?: string, tag?: string, page = 1): Promise<RegistrySearchResult> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (tag) params.set("tag", tag);
    params.set("page", String(page));

    const res = await fetch(`${this.url}/api/skills/search?${params}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Registry search failed: ${res.status} ${res.statusText}`);
    return (await res.json()) as RegistrySearchResult;
  }

  async getSkill(author: string, name: string): Promise<RemoteSkillEntry | null> {
    const res = await fetch(this.skillUrl(author, name), {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Registry request failed: ${res.status}`);
    return (await res.json()) as RemoteSkillEntry;
  }

  async getContent(
    author: string,
    name: string,
    version?: string,
  ): Promise<{
    name: string;
    version: string;
    content: string;
    manifest: SkillManifest;
    integrity: string;
    tokens_estimate: number;
  }> {
    const params = new URLSearchParams();
    if (version) params.set("version", version);

    const res = await fetch(
      `${this.skillUrl(author, name)}/content?${params}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Failed to fetch skill content: ${res.status}`);
    return (await res.json()) as {
      name: string;
      version: string;
      content: string;
      manifest: SkillManifest;
      integrity: string;
      tokens_estimate: number;
    };
  }

  async publish(body: {
    manifest: SkillManifest;
    content: string;
    compact_content?: string;
    source?: { type: "github"; url: string; ref?: string; path?: string };
  }): Promise<PublishResult> {
    const res = await fetch(`${this.url}/api/skills`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Publish failed: ${res.status} ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
    return (await res.json()) as PublishResult;
  }

  async publishWithArchive(metadata: {
    manifest: SkillManifest;
    content: string;
    compact_content?: string;
  }, archive: Buffer): Promise<PublishResult> {
    const formData = new FormData();
    formData.append("metadata", JSON.stringify(metadata));
    formData.append(
      "archive",
      new Blob([archive as unknown as ArrayBuffer]),
      "skill.tar.gz",
    );

    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${this.url}/api/skills`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Publish failed: ${res.status} ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
    return (await res.json()) as PublishResult;
  }

  async getDownloadUrl(
    author: string,
    name: string,
    version?: string,
  ): Promise<DownloadResult> {
    const params = new URLSearchParams();
    if (version) params.set("version", version);

    const res = await fetch(
      `${this.skillUrl(author, name)}/download?${params}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Failed to get download URL: ${res.status}`);
    return (await res.json()) as DownloadResult;
  }

  async getVersions(
    author: string,
    name: string,
  ): Promise<{ version: string; created_at: string }[]> {
    const res = await fetch(
      `${this.skillUrl(author, name)}/versions`,
      { headers: this.headers() },
    );
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Failed to fetch versions: ${res.status}`);
    const data = (await res.json()) as {
      name: string;
      versions: { version: string; created_at: string }[];
    };
    return data.versions;
  }

  async startDeviceAuth(): Promise<{
    session_id: string;
    user_code: string;
    verification_uri: string;
    interval: number;
  }> {
    const res = await fetch(`${this.url}/auth/github/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `GitHub auth failed: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
    return (await res.json()) as {
      session_id: string;
      user_code: string;
      verification_uri: string;
      interval: number;
    };
  }

  async pollDeviceAuth(sessionId: string): Promise<{
    status: string;
    interval?: number;
    author?: { id: number; name: string };
    token?: string;
  }> {
    const res = await fetch(`${this.url}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (res.status === 410) {
      throw new Error("Session expired. Please try again.");
    }
    if (res.status === 404) {
      throw new Error("Session not found. Please try again.");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Poll failed: ${(err as { error?: string }).error ?? res.statusText}`,
      );
    }
    return (await res.json()) as {
      status: string;
      interval?: number;
      author?: { id: number; name: string };
      token?: string;
    };
  }

  async register(
    name: string,
    githubUsername?: string,
  ): Promise<{ author: { id: number; name: string }; token: string }> {
    const res = await fetch(`${this.url}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, github_username: githubUsername }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Registration failed: ${(err as { error?: string }).error ?? res.statusText}`);
    }
    return (await res.json()) as { author: { id: number; name: string }; token: string };
  }

  async sendFeedback(
    author: string,
    skillName: string,
    result: string,
    comment?: string,
  ): Promise<void> {
    const res = await fetch(
      `${this.skillUrl(author, skillName)}/feedback`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ result, comment }),
      },
    );
    if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
  }
}

export function createRegistryClients(config: SkillsConfig): Map<string, RegistryClient> {
  const clients = new Map<string, RegistryClient>();
  for (const reg of config.registries) {
    clients.set(reg.name, new RegistryClient(reg.url, reg.token));
  }
  return clients;
}

export function getClientForSkill(
  config: SkillsConfig,
  _skillRef: string,
): RegistryClient | null {
  const registryName = config.scopes["*"];
  if (!registryName) return null;

  const reg = config.registries.find((r) => r.name === registryName);
  if (!reg) return null;

  return new RegistryClient(reg.url, reg.token);
}
