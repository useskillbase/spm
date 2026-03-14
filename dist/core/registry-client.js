export class RegistryClient {
    url;
    token;
    constructor(url, token) {
        this.url = url;
        this.token = token;
    }
    headers() {
        const h = { "Content-Type": "application/json" };
        if (this.token)
            h["Authorization"] = `Bearer ${this.token}`;
        return h;
    }
    skillUrl(author, name) {
        return `${this.url}/api/skills/${author}/${name}`;
    }
    async search(query, tag, page = 1) {
        const params = new URLSearchParams();
        if (query)
            params.set("q", query);
        if (tag)
            params.set("tag", tag);
        params.set("page", String(page));
        const res = await fetch(`${this.url}/api/skills/search?${params}`, {
            headers: this.headers(),
        });
        if (!res.ok)
            throw new Error(`Registry search failed: ${res.status} ${res.statusText}`);
        return (await res.json());
    }
    async getSkill(author, name) {
        const res = await fetch(this.skillUrl(author, name), {
            headers: this.headers(),
        });
        if (res.status === 404)
            return null;
        if (!res.ok)
            throw new Error(`Registry request failed: ${res.status}`);
        return (await res.json());
    }
    async getContent(author, name, version) {
        const params = new URLSearchParams();
        if (version)
            params.set("version", version);
        const res = await fetch(`${this.skillUrl(author, name)}/content?${params}`, { headers: this.headers() });
        if (!res.ok)
            throw new Error(`Failed to fetch skill content: ${res.status}`);
        return (await res.json());
    }
    async publish(body) {
        const res = await fetch(`${this.url}/api/skills`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Publish failed: ${res.status} ${err.error ?? res.statusText}`);
        }
        return (await res.json());
    }
    async publishWithArchive(metadata, archive) {
        const formData = new FormData();
        formData.append("metadata", JSON.stringify(metadata));
        formData.append("archive", new Blob([archive]), "skill.tar.gz");
        const headers = {};
        if (this.token)
            headers["Authorization"] = `Bearer ${this.token}`;
        const res = await fetch(`${this.url}/api/skills`, {
            method: "POST",
            headers,
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Publish failed: ${res.status} ${err.error ?? res.statusText}`);
        }
        return (await res.json());
    }
    async getDownloadUrl(author, name, version) {
        const params = new URLSearchParams();
        if (version)
            params.set("version", version);
        const res = await fetch(`${this.skillUrl(author, name)}/download?${params}`, { headers: this.headers() });
        if (!res.ok)
            throw new Error(`Failed to get download URL: ${res.status}`);
        return (await res.json());
    }
    async getVersions(author, name) {
        const res = await fetch(`${this.skillUrl(author, name)}/versions`, { headers: this.headers() });
        if (res.status === 404)
            return [];
        if (!res.ok)
            throw new Error(`Failed to fetch versions: ${res.status}`);
        const data = (await res.json());
        return data.versions;
    }
    async startDeviceAuth() {
        const res = await fetch(`${this.url}/auth/github/device`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`GitHub auth failed: ${err.error ?? res.statusText}`);
        }
        return (await res.json());
    }
    async pollDeviceAuth(sessionId) {
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
            throw new Error(`Poll failed: ${err.error ?? res.statusText}`);
        }
        return (await res.json());
    }
    async register(name, githubUsername) {
        const res = await fetch(`${this.url}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, github_username: githubUsername }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`Registration failed: ${err.error ?? res.statusText}`);
        }
        return (await res.json());
    }
    async sendFeedback(author, skillName, result, comment) {
        const res = await fetch(`${this.skillUrl(author, skillName)}/feedback`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ result, comment }),
        });
        if (!res.ok)
            throw new Error(`Feedback failed: ${res.status}`);
    }
}
export function createRegistryClients(config) {
    const clients = new Map();
    for (const reg of config.registries) {
        clients.set(reg.name, new RegistryClient(reg.url, reg.token));
    }
    return clients;
}
export function getClientForSkill(config, _skillRef) {
    const registryName = config.scopes["*"];
    if (!registryName)
        return null;
    const reg = config.registries.find((r) => r.name === registryName);
    if (!reg)
        return null;
    return new RegistryClient(reg.url, reg.token);
}
//# sourceMappingURL=registry-client.js.map