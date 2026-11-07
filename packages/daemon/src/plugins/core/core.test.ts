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
import type { ProvidersSnapshot } from "./core.types";
import { createCorePlugin } from "./core";
import { createDaemonKernel } from "../../daemon-kernel/daemon-kernel";
import { createDaemonServer } from "../../daemon-server/daemon-server";
import { connectSocket } from "../../daemon-server/test.utils";
const provider: ProviderInfo = {
  id: "core-plugin-test",
  name: "Test provider",
  credentialType: "api",
  authStatus: "configured",
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
  it("should persist model roles before applying them", () => {
    const saved: Array<Readonly<Record<string, string>>> = [];
    const core = createCorePlugin({
      modelRoles: { medium: "openai/gpt-5" },
      persistModelRoles: (roles) => saved.push(roles),
    });
    expect(core.getModelRoles()).toEqual({ medium: "openai/gpt-5" });
    core.setModelRoles({ simple: "openai/gpt-5-mini" });
    expect(saved).toEqual([{ simple: "openai/gpt-5-mini" }]);
    expect(core.getModelRoles()).toEqual({ simple: "openai/gpt-5-mini" });
  });

  it("should keep the previous roles when saving fails", () => {
    const core = createCorePlugin({
      modelRoles: { medium: "openai/gpt-5" },
      persistModelRoles() {
        throw new Error("disk full");
      },
    });
    expect(() => core.setModelRoles({})).toThrow("disk full");
    expect(core.getModelRoles()).toEqual({ medium: "openai/gpt-5" });
  });

  it("should list providers without provider API calls or credential values until loaded", async () => {
    let providerCalls = 0;
    registerProviderDefinition({
      id: provider.id,
      name: provider.name,
      credentialType: "api",
      async listModels() {
        providerCalls++;
        return provider.models;
      },
    });
    await getGlobalCredentialStore().set(provider.id, "$global", {
      type: "api",
      key: "secret-test-key",
    });
    const plugin = createCorePlugin();
    try {
      await plugin.providers.ready();
      const { providers } = plugin.providers.snapshot();
      expect(providers.find((entry) => entry.id === provider.id)).toMatchObject(
        { authStatus: "configured", origin: "registered", models: [] },
      );
      expect(providers.map((entry) => entry.id)).toEqual(
        providers.map((entry) => entry.id).sort(),
      );
      expect(providers.some((entry) => entry.id === "openai")).toBe(true);
      expect(providerCalls).toBe(0);
      await plugin.providers.load();
      expect(providerCalls).toBe(1);
      const loaded = plugin.providers.snapshot();
      expect(loaded.refreshing).toBe(false);
      expect(
        loaded.providers.find((entry) => entry.id === provider.id)?.models,
      ).toEqual(provider.models);
      expect(JSON.stringify(loaded)).not.toContain("secret-test-key");
    } finally {
      await plugin.dispose();
    }
  });
  it("should publish a new snapshot after a provider change", async () => {
    const plugin = createCorePlugin();
    const snapshots: ProvidersSnapshot[] = [];
    try {
      await plugin.providers.ready();
      const unsubscribe = await plugin.notifications.subscribe(
        "providers_updated",
        "providers",
        ({ snapshot }) => {
          snapshots.push(snapshot);
        },
      );
      expect(snapshots).toHaveLength(1);
      await plugin.providers.addCustomProviderModel({
        providerId: "openai",
        modelId: "org/manual",
      });
      expect(snapshots).toHaveLength(2);
      expect(
        snapshots[1]!.providers
          .find((entry) => entry.id === "openai")
          ?.models.some((model) => model.id === "org/manual"),
      ).toBe(true);
      unsubscribe();
    } finally {
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
    await plugin.providers.ready();
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
            if (!signal) {
              throw new Error("Expected verification cancellation signal");
            }
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
      ) {
        throw new Error("Expected successful command");
      }
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
  it("should send the provider list over the kernel websocket channel", async () => {
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const requestId = crypto.randomUUID();
      client.send({
        type: "subscribe",
        requestId,
        channel: "core.providers.list",
        arguments: {},
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        requestId,
        ok: true,
      });
      expect(await client.next()).toMatchObject({
        type: "providers.updated",
        requestId,
        data: {
          refreshing: false,
          providers: expect.arrayContaining([
            expect.objectContaining({ id: "openai" }),
          ]),
        },
      });
    } finally {
      client.socket.close();
      await server.stop();
      await kernel.dispose();
    }
  });
  it("should push model role changes to every watching client", async () => {
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
      modelRoles: { medium: "openai/gpt-5" },
    });
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const watcher = await connectSocket(server.url);
    const editor = await connectSocket(server.url);
    try {
      const requestId = crypto.randomUUID();
      watcher.send({
        type: "subscribe",
        requestId,
        channel: "core.modelRoles.watch",
        arguments: {},
      });
      expect(await watcher.next()).toMatchObject({ ok: true, requestId });
      expect(await watcher.next()).toMatchObject({
        type: "modelRoles.updated",
        data: {
          modelRoles: { medium: "openai/gpt-5" },
          defaults: expect.arrayContaining([
            expect.objectContaining({ name: "medium" }),
          ]),
        },
      });
      editor.send({
        type: "command",
        requestId: crypto.randomUUID(),
        command: "core.modelRoles.set",
        arguments: {
          modelRoles: { medium: "openai/gpt-5", simple: "openai/gpt-5-mini" },
        },
      });
      expect(await editor.next()).toMatchObject({ ok: true });
      expect(await watcher.next()).toMatchObject({
        type: "modelRoles.updated",
        data: {
          modelRoles: { medium: "openai/gpt-5", simple: "openai/gpt-5-mini" },
        },
      });
    } finally {
      watcher.socket.close();
      editor.socket.close();
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
        if (result.type !== "response" || !("ok" in result) || !result.ok) {
          throw new Error("Expected a successful response.");
        }
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
      ) {
        throw new Error("Missing attempt handle.");
      }
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
