import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

// Mock fetch globally to intercept GitHub API calls and registry calls
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Import after mocking
import { RegistryClient } from "../src/core/registry-client.js";

describe("RegistryClient device auth", () => {
  const client = new RegistryClient("http://localhost:3717");

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("startDeviceAuth sends POST and returns session data", async () => {
    const mockResponse = {
      session_id: "abc123",
      user_code: "ABCD-1234",
      verification_uri: "https://github.com/login/device",
      interval: 5,
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await client.startDeviceAuth();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3717/auth/github/device",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(result.session_id).toBe("abc123");
    expect(result.user_code).toBe("ABCD-1234");
    expect(result.verification_uri).toBe("https://github.com/login/device");
    expect(result.interval).toBe(5);
  });

  it("startDeviceAuth throws on server error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      statusText: "Service Unavailable",
      json: async () => ({ error: "GitHub OAuth is not configured on this registry server" }),
    });

    await expect(client.startDeviceAuth()).rejects.toThrow(
      "GitHub OAuth is not configured on this registry server",
    );
  });

  it("pollDeviceAuth returns pending status", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "pending" }),
    });

    const result = await client.pollDeviceAuth("session-abc");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3717/auth/github/device/poll",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "session-abc" }),
      },
    );
    expect(result.status).toBe("pending");
  });

  it("pollDeviceAuth returns complete with author and token", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: "complete",
        author: { id: 1, name: "testuser" },
        token: "sk-abc123",
      }),
    });

    const result = await client.pollDeviceAuth("session-abc");

    expect(result.status).toBe("complete");
    expect(result.author).toEqual({ id: 1, name: "testuser" });
    expect(result.token).toBe("sk-abc123");
  });

  it("pollDeviceAuth returns increased interval on slow_down", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: "pending", interval: 10 }),
    });

    const result = await client.pollDeviceAuth("session-abc");

    expect(result.status).toBe("pending");
    expect(result.interval).toBe(10);
  });

  it("pollDeviceAuth throws on expired session (410)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({ error: "Session expired" }),
    });

    await expect(client.pollDeviceAuth("session-expired")).rejects.toThrow(
      "Session expired",
    );
  });

  it("pollDeviceAuth throws on missing session (404)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "Session not found" }),
    });

    await expect(client.pollDeviceAuth("session-missing")).rejects.toThrow(
      "Session not found",
    );
  });
});
