import type {
  SyncManifest,
  SyncProjectPrompt,
  SyncFeatureMap,
  SyncKnowledgeItem,
  SyncFeatureDiff,
  SyncContextOperation,
  SyncPushResult,
  SyncFeatureListItem,
  SyncSearchResult,
  SyncConnection,
  SyncProjectListItem,
  SyncJson,
  SkillsConfig,
  SyncCommentList,
  SyncFeatureLink,
  SyncKnowledgeLink,
} from "../types/index.js";

export class SyncClient {
  private readonly api: string;
  private readonly key: string;

  constructor(api: string, key: string) {
    this.api = api.replace(/\/$/, "");
    this.key = key;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.api}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let reason = "";
      try {
        const parsed = JSON.parse(text) as { error?: string; reason?: string };
        reason = parsed.reason ?? parsed.error ?? "";
      } catch {
        reason = text.slice(0, 200);
      }
      throw new Error(`Sync API ${res.status}: ${reason || res.statusText}`);
    }

    return (await res.json()) as T;
  }

  // -- Projects --

  async getManifest(projectId: string): Promise<SyncManifest> {
    return this.request("GET", `/projects/${projectId}/manifest`);
  }

  async getProjectPrompt(projectId: string): Promise<SyncProjectPrompt> {
    return this.request("GET", `/projects/${projectId}/prompt`);
  }

  // -- Companies & Projects --

  async listProjects(
    companySlug: string,
  ): Promise<{ projects: SyncProjectListItem[] }> {
    return this.request("GET", `/companies/${companySlug}/projects`);
  }

  async createProject(
    companySlug: string,
    name: string,
    slug: string,
  ): Promise<{ project: SyncProjectListItem }> {
    return this.request("POST", `/companies/${companySlug}/projects`, {
      name,
      slug,
    });
  }

  async updateProject(
    projectId: string,
    updates: {
      name?: string;
      promptContent?: string;
      conventions?: Record<string, unknown>;
      knowledgeUpdateMode?: "auto" | "confirm";
      language?: string;
      links?: unknown[];
    },
  ): Promise<unknown> {
    return this.request("PATCH", `/projects/${projectId}`, updates);
  }

  // -- Features --

  async getFeatureMap(
    featureId: string,
    opts: { includeGraph?: boolean; depth?: 1 | 2 } = {},
  ): Promise<SyncFeatureMap> {
    const qs = new URLSearchParams();
    if (opts.includeGraph === false) qs.set("include_graph", "false");
    if (opts.depth === 2) qs.set("depth", "2");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request("GET", `/features/${featureId}/map${suffix}`);
  }

  async getFeatureKnowledge(
    featureId: string,
    types?: string[],
  ): Promise<{ items: SyncKnowledgeItem[] }> {
    const query = types?.length ? `?type=${types.join(",")}` : "";
    return this.request("GET", `/features/${featureId}/knowledge${query}`);
  }

  async getFeatureDescription(
    featureId: string,
  ): Promise<{ description: string | null }> {
    return this.request("GET", `/features/${featureId}/description`);
  }

  async getFeatureDiff(
    featureId: string,
    sinceVersion: number,
  ): Promise<SyncFeatureDiff> {
    return this.request(
      "GET",
      `/features/${featureId}/diff?since_version=${sinceVersion}`,
    );
  }

  async pushContext(
    featureId: string,
    operations: SyncContextOperation[],
  ): Promise<SyncPushResult> {
    return this.request("PATCH", `/features/${featureId}/context`, {
      operations,
      source: "spm",
    });
  }

  async getFeatureComments(
    featureId: string,
    opts: {
      since?: string;
      targetType?: string;
      targetId?: string;
      includeArchived?: boolean;
      withTargets?: boolean;
    } = {},
  ): Promise<SyncCommentList> {
    const qs = new URLSearchParams();
    if (opts.since) qs.set("since", opts.since);
    if (opts.targetType) qs.set("target_type", opts.targetType);
    if (opts.targetId) qs.set("target_id", opts.targetId);
    if (opts.includeArchived) qs.set("include_archived", "true");
    if (opts.withTargets) qs.set("with_targets", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return this.request("GET", `/features/${featureId}/comments${suffix}`);
  }

  // -- Feature listing --

  async listFeatures(
    projectId: string,
    status?: string,
  ): Promise<{ features: SyncFeatureListItem[] }> {
    const query = status ? `?status=${status}` : "";
    return this.request("GET", `/projects/${projectId}/features${query}`);
  }

  async createFeature(
    projectId: string,
    data: {
      title: string;
      slug: string;
      description?: string;
      status?: string;
      links?: unknown[];
    },
  ): Promise<{ feature: SyncFeatureListItem }> {
    return this.request("POST", `/projects/${projectId}/features`, data);
  }

  async updateFeature(
    featureId: string,
    updates: {
      title?: string;
      status?: string;
      description?: string;
      links?: unknown[];
    },
  ): Promise<{ feature: SyncFeatureListItem }> {
    return this.request("PATCH", `/features/${featureId}`, updates);
  }

  async deleteFeature(featureId: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/features/${featureId}`);
  }

  // -- Feature & Knowledge Links --

  async createFeatureLink(data: {
    source_id: string;
    target_id: string;
    type: string;
    reason: string;
  }): Promise<{ link: SyncFeatureLink }> {
    return this.request("POST", `/feature-links`, data);
  }

  async deleteFeatureLink(linkId: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/feature-links/${linkId}`);
  }

  async createKnowledgeLink(data: {
    source_item_id: string;
    target_item_id: string;
    type: string;
    reason: string;
  }): Promise<{ link: SyncKnowledgeLink }> {
    return this.request("POST", `/knowledge-links`, data);
  }

  async deleteKnowledgeLink(linkId: string): Promise<{ deleted: boolean }> {
    return this.request("DELETE", `/knowledge-links/${linkId}`);
  }

  // -- Search --

  async searchProject(
    projectId: string,
    query: string,
    limit?: number,
  ): Promise<SyncSearchResult> {
    return this.request("POST", `/projects/${projectId}/search`, {
      query,
      limit,
    });
  }
}

/**
 * Resolve the active sync connection and return a client, or null if not configured.
 */
export function getSyncClient(config: SkillsConfig): {
  client: SyncClient;
  connection: SyncConnection;
} | null {
  const sync = config.sync;
  if (!sync?.connections?.length) return null;

  const activeSlug = sync.active_connection;
  const connection = activeSlug
    ? sync.connections.find((c) => c.company === activeSlug)
    : sync.connections[0];

  if (!connection) return null;

  return {
    client: new SyncClient(connection.api, connection.key),
    connection,
  };
}

/**
 * Resolve a sync client for a specific project binding (from .skillbase/sync.json).
 * Picks the connection matching the company slug in syncJson.
 */
export function getSyncClientForProject(
  config: SkillsConfig,
  syncJson: SyncJson,
): {
  client: SyncClient;
  connection: SyncConnection;
  projectId: string;
} | null {
  const sync = config.sync;
  if (!sync?.connections?.length) return null;

  const connection = sync.connections.find(
    (c) => c.company === syncJson.company,
  );
  if (!connection) return null;

  return {
    client: new SyncClient(connection.api, connection.key),
    connection,
    projectId: syncJson.project_id,
  };
}
