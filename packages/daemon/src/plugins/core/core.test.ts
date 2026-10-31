import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCredentialStore,
  createJsonFileCredentialBackend,
  getGlobalCredentialStore,
  registerProviderDefinition,
  setGlobalCredentialStore,
  unregisterProviderDefinition,
  setProviderSettingsPath,
  reloadProviderSettings,
  resetProviderRegistry,
} from "@comma-agents/core";
import type { ProviderInfo } from "@comma-agents/core";
import { createCorePlugin } from "./core";
import { createDaemonKernel } from "../../daemon-kernel/daemon-kernel";
import { createDaemonServer } from "../../daemon-server/daemon-server";
import { connectSocket } from "../../daemon-server/test.utils";
const provider: ProviderInfo = {
  id: "core-plugin-test",
  name: "Test provider",
  credentialType: "api",
  authStatus: "configured",
  discovery: { status: "live", fetchedAt: "2026-01-01T00:00:00.000Z" },
  models: [
    {
      id: "test-model",
      sources: ["user"],
      metadata: {
        name: "Test model",
        family: "test",
        contextWindow: 100,
        maxInputTokens: 80,
        maxOutputTokens: 20,
        knowledgeCutoff: "2025-01",
        releaseDate: "2025-02-01",
        lastUpdated: "2026-01-01",
        status: "beta",
        modalities: { input: ["text", "image"], output: ["text"] },
        capabilities: {
          tools: true,
          reasoning: false,
          vision: true,
          attachment: true,
          structuredOutput: true,
          teeAttestation: true,
          e2ee: false,
        },
        cost: {
          input: 1,
          output: 2,
          reasoning: 3,
          cacheRead: 0.1,
          cacheWrite: 0.2,
        },
      },
    },
  ],
  origin: "user",
};
let directory: string;
let previousStore: ReturnType<typeof getGlobalCredentialStore>;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "core-plugin-"));
  previousStore = getGlobalCredentialStore();
  setProviderSettingsPath(join(directory, "provider-settings.json"));
  resetProviderRegistry();
  await reloadProviderSettings();
  setGlobalCredentialStore(
    createCredentialStore({
      backend: createJsonFileCredentialBackend({
        filePath: join(directory, "credentials.json"),
      }),
      env: {},
    }),
  );
});
afterEach(async () => {
  unregisterProviderDefinition(provider.id);
  setGlobalCredentialStore(previousStore);
  setProviderSettingsPath(undefined);
  resetProviderRegistry();
  await rm(directory, { recursive: true, force: true });
});
describe("createCorePlugin", () => {
  it("should discover core providers with scoped auth status without live calls or credential values", async () => {
    let liveCalls = 0;
    registerProviderDefinition({
      id: provider.id,
      name: provider.name,
      credentialType: "api",
      async listModels() {
        liveCalls++;
        return provider.models;
      },
    });
    await getGlobalCredentialStore().set(provider.id, "workspace", {
      type: "api",
      key: "secret-test-key",
    });
    const plugin = createCorePlugin();
    try {
      const scoped = await plugin.providers.list({ scope: "workspace" });
      expect(
        await plugin.server.commands[0]!.invoke({ scope: "workspace" }),
      ).toEqual({ providers: scoped });
      expect(scoped.find((entry) => entry.id === provider.id)).toMatchObject({
        authStatus: "configured",
        origin: "registered",
        discovery: {
          status: "catalog_only",
        },
      });
      const global = await plugin.providers.list();
      expect(global.find((entry) => entry.id === provider.id)?.authStatus).toBe(
        "none",
      );
      expect(global.map((entry) => entry.id)).toEqual(
        global.map((entry) => entry.id).sort(),
      );
      expect(global.some((entry) => entry.id === "openai")).toBe(true);
      expect(liveCalls).toBe(0);
      expect(JSON.stringify(scoped)).not.toContain("secret-test-key");
    } finally {
      await plugin.dispose();
    }
  });
  it("should validate arguments, forward live options and retain complete model metadata", async () => {
    const plugin = createCorePlugin();
    const lookup = spyOn(plugin.providers, "list").mockResolvedValue([
      provider,
    ]);
    try {
      const command = plugin.server.commands[0]!;
      expect(await command.invoke({})).toEqual({ providers: [provider] });
      expect(lookup).toHaveBeenLastCalledWith({ live: false });
      expect(await command.invoke({ live: true, scope: "workspace" })).toEqual({
        providers: [provider],
      });
      expect(lookup).toHaveBeenLastCalledWith({
        live: true,
        scope: "workspace",
      });
      await expect(command.invoke({ live: "true" })).rejects.toThrow();
      await expect(command.invoke({ scope: 42 })).rejects.toThrow();
      await expect(command.invoke({ unknown: true })).rejects.toThrow();
      expect(lookup).toHaveBeenCalledTimes(2);
      lookup.mockRejectedValue(new Error("Discovery unavailable"));
      await expect(command.invoke({})).rejects.toThrow("Discovery unavailable");
    } finally {
      lookup.mockRestore();
      await plugin.dispose();
    }
  });
  it("should validate and delegate provider mutations while excluding secrets from every result", async () => {
    const plugin = createCorePlugin();
    const configuration = {
      providerId: provider.id,
      authStatus: "configured" as const,
      hasSavedCredential: true,
      credentialSource: "global" as const,
      verificationSupported: false,
      customProvider: null,
      customModels: [{ id: "org/manual" }],
    };
    const cases = [
      {
        name: "getConfiguration",
        arguments: { providerId: provider.id },
        output: configuration,
      },
      {
        name: "configure",
        arguments: { providerId: provider.id, apiKey: "input-secret" },
        output: configuration,
      },
      {
        name: "removeCredential",
        arguments: { providerId: provider.id },
        output: configuration,
      },
      {
        name: "verify",
        arguments: { providerId: provider.id },
        output: {
          providerId: provider.id,
          status: "unsupported",
          checkedAt: "2026-10-24T12:00:00.000Z",
        },
      },
      {
        name: "addCustomProvider",
        arguments: {
          id: provider.id,
          name: "Test provider",
          baseURL: "http://localhost:1234/v1",
          credentialType: "none",
          models: [{ id: "org/manual" }],
        },
        output: provider,
      },
      {
        name: "updateCustomProvider",
        arguments: { providerId: provider.id, name: "Renamed" },
        output: provider,
      },
      {
        name: "removeCustomProvider",
        arguments: { providerId: provider.id },
        output: { providerId: provider.id, removed: true },
      },
      {
        name: "addCustomProviderModel",
        arguments: { providerId: provider.id, modelId: "org/manual" },
        output: provider,
      },
      {
        name: "removeCustomProviderModel",
        arguments: { providerId: provider.id, modelId: "org/manual" },
        output: provider,
      },
    ] as const;
    try {
      for (const testCase of cases) {
        const command = plugin.server.commands.find(
          (entry) => entry.name === `core.providers.${testCase.name}`,
        )!;
        const method = spyOn(plugin.providers, testCase.name);
        method.mockResolvedValue(testCase.output);
        try {
          const result = await command.invoke(testCase.arguments);
          expect(result).toEqual(testCase.output);
          expect(method).toHaveBeenCalledTimes(1);
          expect(method).toHaveBeenCalledWith(testCase.arguments);
          expect(JSON.stringify(result)).not.toContain("not-public");
          expect(JSON.stringify(result)).not.toContain("input-secret");
          await expect(
            command.invoke({ ...testCase.arguments, unexpected: true }),
          ).rejects.toThrow();
          expect(method).toHaveBeenCalledTimes(1);
        } finally {
          method.mockRestore();
        }
      }
      const configure = plugin.server.commands.find(
        (entry) => entry.name === "core.providers.configure",
      )!;
      await expect(
        configure.invoke({ providerId: provider.id }),
      ).rejects.toThrow();
      await expect(
        configure.invoke({ providerId: provider.id, apiKey: 42 }),
      ).rejects.toThrow();
      const add = plugin.server.commands.find(
        (entry) => entry.name === "core.providers.addCustomProvider",
      )!;
      await expect(
        add.invoke({
          id: "custom",
          name: "Custom",
          baseURL: "http://localhost",
          credentialType: "oauth",
        }),
      ).rejects.toThrow();
    } finally {
      await plugin.dispose();
    }
  });
  it("should cancel an in-flight core verification when the plugin is disposed", async () => {
    const plugin = createCorePlugin();
    await plugin.providers.list();
    await getGlobalCredentialStore().set("openai", "$global", {
      type: "api",
      key: "verification-secret",
    });
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const request = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        (
          _input: Parameters<typeof fetch>[0],
          options?: Parameters<typeof fetch>[1],
        ) => {
          const signal = options?.signal;
          markStarted();
          return new Promise<Response>((_resolve, reject) => {
            if (!signal)
              throw new Error("Expected verification cancellation signal");
            signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          });
        },
        { preconnect: fetch.preconnect },
      ),
    );
    try {
      const verification = plugin.providers.verify({ providerId: "openai" });
      await started;
      await plugin.dispose();
      expect(await verification).toMatchObject({
        providerId: "openai",
        status: "unavailable",
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]?.[0]).toBe(
        "https://api.openai.com/v1/models",
      );
    } finally {
      request.mockRestore();
      await plugin.dispose();
    }
  });
  it("should expose core configuration and custom-model mutations through the actual websocket without secrets", async () => {
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const client = await connectSocket(server.url);
    async function invoke(
      command: string,
      argumentsValue: Record<string, unknown>,
    ) {
      const requestId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId,
        command: `core.providers.${command}`,
        arguments: argumentsValue,
      });
      const response = await client.next();
      expect(response).toMatchObject({ type: "response", requestId, ok: true });
      expect(JSON.stringify(response)).not.toContain("websocket-secret");
      if (
        response.type !== "response" ||
        !("ok" in response) ||
        !response.ok ||
        !("data" in response)
      )
        throw new Error("Expected successful command");
      return response.data;
    }
    try {
      const added = await invoke("addCustomProvider", {
        id: "daemon-custom",
        name: "Daemon custom",
        baseURL: "http://localhost:1234/v1",
        credentialType: "api",
        models: [{ id: "org/manual" }],
      });
      expect(added).toMatchObject({
        id: "daemon-custom",
        origin: "user",
        models: [{ id: "org/manual", sources: ["user"], metadata: {} }],
      });
      const configured = await invoke("configure", {
        providerId: "daemon-custom",
        apiKey: "websocket-secret",
      });
      expect(configured).toMatchObject({
        providerId: "daemon-custom",
        authStatus: "configured",
        hasSavedCredential: true,
        credentialSource: "global",
      });
      expect(
        await invoke("getConfiguration", { providerId: "daemon-custom" }),
      ).toMatchObject({
        customProvider: {
          name: "Daemon custom",
          baseURL: "http://localhost:1234/v1",
          credentialType: "api",
        },
        customModels: [{ id: "org/manual" }],
      });
      expect(
        await invoke("verify", { providerId: "daemon-custom" }),
      ).toMatchObject({ providerId: "daemon-custom", status: "unsupported" });
      expect(
        await invoke("addCustomProviderModel", {
          providerId: "daemon-custom",
          modelId: "second",
          metadata: {
            name: "Second model",
            contextWindow: 32768,
            capabilities: { tools: true },
            cost: { input: 0.5 },
          },
        }),
      ).toMatchObject({
        models: [
          { id: "org/manual" },
          {
            id: "second",
            sources: ["user"],
            metadata: {
              name: "Second model",
              contextWindow: 32768,
              capabilities: { tools: true },
              cost: { input: 0.5 },
            },
          },
        ],
      });
      expect(
        await invoke("removeCustomProviderModel", {
          providerId: "daemon-custom",
          modelId: "org/manual",
        }),
      ).toMatchObject({ models: [{ id: "second" }] });
      expect(
        await invoke("removeCustomProvider", { providerId: "daemon-custom" }),
      ).toEqual({ providerId: "daemon-custom", removed: true });
      expect(
        await getGlobalCredentialStore().get("daemon-custom", "$global"),
      ).toBeUndefined();
    } finally {
      client.socket.close();
      await server.stop();
      await kernel.dispose();
    }
  });
  it("should route provider discovery through the kernel websocket using the request id", async () => {
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const lookup = spyOn(
      kernel.plugins.core.providers,
      "list",
    ).mockResolvedValue([provider]);
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const requestId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId,
        command: "core.providers.list",
        arguments: { scope: "workspace", live: true },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        requestId,
        ok: true,
        data: { providers: [provider] },
      });
      expect(lookup).toHaveBeenLastCalledWith({
        scope: "workspace",
        live: true,
      });
      lookup.mockRejectedValue(new Error("Discovery unavailable"));
      const failedId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId: failedId,
        command: "core.providers.list",
        arguments: {},
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        requestId: failedId,
        ok: false,
        error: { code: "INTERNAL_ERROR" },
      });
    } finally {
      client.socket.close();
      lookup.mockRestore();
      await server.stop();
      await kernel.dispose();
    }
  });
  it("should route subscription sign-in progress and cancellation without exposing credentials", async () => {
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const invoke = async (
        command: string,
        options: Record<string, string>,
      ) => {
        const requestId = crypto.randomUUID();
        client.send({
          type: "command",
          requestId,
          command: `core.providers.${command}`,
          arguments: options,
        });
        const result = await client.next();
        expect(result).toMatchObject({ type: "response", requestId, ok: true });
        if (result.type !== "response" || !("ok" in result) || !result.ok)
          throw new Error("Expected a successful response.");
        return result.data;
      };
      const started = await invoke("beginSignIn", { providerId: "openai" });
      expect(started).toMatchObject({
        authorizationURL: expect.stringContaining(
          "https://auth.openai.com/api/accounts/authorize?",
        ),
      });
      if (
        !started ||
        typeof started !== "object" ||
        !("attemptId" in started) ||
        typeof started.attemptId !== "string"
      )
        throw new Error("Missing attempt handle.");
      expect(
        await invoke("getSignInStatus", { attemptId: started.attemptId }),
      ).toEqual({ attemptId: started.attemptId, status: "pending" });
      expect(
        await invoke("cancelSignIn", { attemptId: started.attemptId }),
      ).toEqual({ attemptId: started.attemptId, status: "cancelled" });
      expect(
        await getGlobalCredentialStore().get("openai", "$global"),
      ).toBeUndefined();
      expect(JSON.stringify(started)).not.toContain("access_token");
      expect(JSON.stringify(started)).not.toContain("code_verifier");
    } finally {
      client.socket.close();
      await server.stop();
      await kernel.dispose();
    }
  });
});
