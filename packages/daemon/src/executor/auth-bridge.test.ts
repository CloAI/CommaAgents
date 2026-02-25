// Tests for the auth bridge — bridges provider auth requests over WS.

import { describe, expect, it } from "bun:test";
import type { CredentialStore } from "../credentials/types";
import type { DaemonMessage } from "../protocol/daemon";
import type { Credential } from "../protocol/shared";
import { createAuthBridge } from "./auth-bridge";
import type { EventSink } from "./event-sink";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock EventSink that records all calls. */
function mockSink(): EventSink & {
  broadcasts: Array<{ runId: string; message: DaemonMessage }>;
  sends: Array<{ clientId: string; message: DaemonMessage }>;
} {
  const broadcasts: Array<{ runId: string; message: DaemonMessage }> = [];
  const sends: Array<{ clientId: string; message: DaemonMessage }> = [];
  return {
    broadcasts,
    sends,
    broadcast(runId: string, message: DaemonMessage) {
      broadcasts.push({ runId, message });
    },
    send(clientId: string, message: DaemonMessage) {
      sends.push({ clientId, message });
    },
  };
}

/** Create a mock CredentialStore that tracks set() calls. */
function mockCredentialStore(): CredentialStore & {
  setCalls: Array<{ providerId: string; scope: string; credential: Credential }>;
} {
  const setCalls: Array<{
    providerId: string;
    scope: string;
    credential: Credential;
  }> = [];

  return {
    setCalls,
    async resolve() {
      return undefined;
    },
    async get() {
      return undefined;
    },
    async set(providerId: string, scope: string, credential: Credential) {
      setCalls.push({ providerId, scope, credential });
    },
    async remove() {
      return false;
    },
    async list() {
      return [];
    },
    async listScopes() {
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAuthBridge", () => {
  it("sends request_auth to the specific client when requestAuth is called", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    // Call requestAuth (don't await — we'll resolve manually)
    const promise = bridge.requestAuth("openai", "OPENAI_API_KEY");

    // Verify request_auth was sent to the specific client
    expect(sink.sends).toHaveLength(1);
    expect(sink.broadcasts).toHaveLength(0); // Not broadcast — targeted
    const msg = sink.sends[0].message;
    expect(sink.sends[0].clientId).toBe("client-1");
    expect(msg.type).toBe("request_auth");
    if (msg.type === "request_auth") {
      expect(msg.providerId).toBe("openai");
      expect(msg.runId).toBe("run-1");
      expect(msg.envVar).toBe("OPENAI_API_KEY");
      expect(msg.ts).toBeDefined();
    }

    // Resolve so the promise doesn't hang
    const cred: Credential = { type: "api", key: "sk-test-key" };
    await bridge.resolveAuth("openai", cred, "$global", false);
    const result = await promise;
    expect(result).toEqual(cred);
  });

  it("resolveAuth resolves the pending promise", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    const promise = bridge.requestAuth("anthropic");

    const cred: Credential = { type: "api", key: "sk-ant-key" };
    const resolved = await bridge.resolveAuth("anthropic", cred, "$global", false);
    expect(resolved).toBe(true);

    const result = await promise;
    expect(result).toEqual(cred);
  });

  it("resolveAuth with persist=true calls credentialStore.set()", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    const promise = bridge.requestAuth("openai");

    const cred: Credential = { type: "api", key: "sk-persist-key" };
    await bridge.resolveAuth("openai", cred, "my-strategy", true);
    await promise;

    expect(store.setCalls).toHaveLength(1);
    expect(store.setCalls[0]).toEqual({
      providerId: "openai",
      scope: "my-strategy",
      credential: cred,
    });
  });

  it("resolveAuth with persist=false does not call credentialStore.set()", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    const promise = bridge.requestAuth("openai");

    const cred: Credential = { type: "api", key: "sk-no-persist" };
    await bridge.resolveAuth("openai", cred, "$global", false);
    await promise;

    expect(store.setCalls).toHaveLength(0);
  });

  it("resolveAuth returns false for unknown provider", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    const cred: Credential = { type: "api", key: "sk-key" };
    const resolved = await bridge.resolveAuth("nonexistent", cred, "$global", false);
    expect(resolved).toBe(false);
  });

  it("rejects with timeout error when timeout expires", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
      timeout: 50,
    });

    const promise = bridge.requestAuth("openai");
    await expect(promise).rejects.toThrow(/timed out after 50ms/);
  });

  it("rejects when abort signal fires", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const ac = new AbortController();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
      abort: ac.signal,
    });

    const promise = bridge.requestAuth("openai");
    ac.abort();

    await expect(promise).rejects.toThrow("Run aborted");
  });

  it("rejects immediately if abort signal is already aborted", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const ac = new AbortController();
    ac.abort();

    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
      abort: ac.signal,
    });

    await expect(bridge.requestAuth("openai")).rejects.toThrow("Run aborted");
    // No message should have been sent
    expect(sink.sends).toHaveLength(0);
  });

  it("destroy rejects all pending requests", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    const promise1 = bridge.requestAuth("openai");
    const promise2 = bridge.requestAuth("anthropic");

    bridge.destroy();

    await expect(promise1).rejects.toThrow("Auth bridge destroyed");
    await expect(promise2).rejects.toThrow("Auth bridge destroyed");
  });

  it("rejects new requests after destroy", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    bridge.destroy();

    await expect(bridge.requestAuth("openai")).rejects.toThrow("Auth bridge destroyed");
  });

  it("supports OAuth credentials", async () => {
    const sink = mockSink();
    const store = mockCredentialStore();
    const bridge = createAuthBridge({
      sink,
      clientId: "client-1",
      runId: "run-1",
      credentialStore: store,
      strategyName: "test-strategy",
    });

    const promise = bridge.requestAuth("google");

    const oauthCred: Credential = {
      type: "oauth",
      accessToken: "ya29.xxx",
      refreshToken: "1//xxx",
      expiresAt: "2026-12-31T23:59:59Z",
    };

    await bridge.resolveAuth("google", oauthCred, "$global", true);
    const result = await promise;

    expect(result).toEqual(oauthCred);
    expect(store.setCalls).toHaveLength(1);
    expect(store.setCalls[0].credential).toEqual(oauthCred);
  });
});
