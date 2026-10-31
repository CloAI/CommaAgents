import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addCustomProviderModel,
  createCredentialStore,
  createJsonFileCredentialBackend,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
  setCatalogCachePath,
  getCatalogCachePath,
  resetCatalog,
  getCatalogSnapshot,
  getProvidersForModel,
  setProviderSettingsPath,
  resetProviderRegistry,
  reloadProviderSettings,
  registerProviderDefinition,
} from "@comma-agents/core";
import { createCorePlugin } from "./core";
import { createDaemonKernel } from "../../daemon-kernel/daemon-kernel";
import { createDaemonServer } from "../../daemon-server/daemon-server";
import { connectSocket } from "../../daemon-server/test.utils";
let directory: string;
let previousStore: ReturnType<typeof getGlobalCredentialStore>;
let previousCache: string;
const originalFetch = globalThis.fetch;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "provider-refresh-"));
  previousStore = getGlobalCredentialStore();
  previousCache = getCatalogCachePath();
  setCatalogCachePath(join(directory, "catalog.json"));
  setProviderSettingsPath(join(directory, "settings.json"));
  resetCatalog();
  resetProviderRegistry();
  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 503 }),
  );
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
  globalThis.fetch = originalFetch;
  setGlobalCredentialStore(previousStore);
  setCatalogCachePath(previousCache);
  setProviderSettingsPath(undefined);
  resetProviderRegistry();
  resetCatalog();
  await rm(directory, { recursive: true, force: true });
});
describe("core.providers.refresh", () => {
  it("should validate scope and delegate refresh", async () => {
    const plugin = createCorePlugin();
    const provider = {
      id: "openai",
      name: "OpenAI",
      credentialType: "api",
      authStatus: "none",
      models: [],
      origin: "catalog",
      discovery: {
        status: "catalog_only",
      },
    } as const;
    const refresh = spyOn(plugin.providers, "refresh").mockResolvedValue(
      provider,
    );
    const command = plugin.server.commands.find(
      (entry) => entry.name === "core.providers.refresh",
    )!;
    try {
      expect(
        await command.invoke({ providerId: "openai", scope: "workspace" }),
      ).toEqual(provider);
      expect(refresh).toHaveBeenCalledWith({
        providerId: "openai",
        scope: "workspace",
      });
      await expect(command.invoke({})).rejects.toThrow();
      await expect(command.invoke({ live: false })).rejects.toThrow();
      await expect(command.invoke({ scope: 42 })).rejects.toThrow();
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      refresh.mockRestore();
      await plugin.dispose();
    }
  });
  it("should refresh catalog before live discovery through the websocket and preserve registrations", async () => {
    const snapshot = getCatalogSnapshot();
    expect(getProvidersForModel("new-refresh-model")).toEqual([]);
    const calls: string[] = [];
    registerProviderDefinition({
      id: "other-provider",
      name: "Other provider",
      credentialType: "none",
      async listModels() {
        calls.push("other-live");
        return [{ id: "other-model", sources: ["provider"], metadata: {} }];
      },
    });
    registerProviderDefinition({
      id: "refresh-custom",
      name: "Custom registration",
      credentialType: "api",
      async listModels({ credential }) {
        calls.push("live");
        expect(credential).toEqual({ type: "api", key: "refresh-secret" });
        return [
          {
            id: "live-model",
            sources: ["provider"],
            metadata: {
              name: "Live name",
              capabilities: { e2ee: false },
              cost: { input: 0 },
            },
          },
        ];
      },
    });
    await addCustomProviderModel({
      providerId: "refresh-custom",
      modelId: "manual-model",
    });
    await addCustomProviderModel({
      providerId: "refresh-custom",
      modelId: "live-model",
      metadata: { capabilities: { teeAttestation: true, e2ee: true } },
    });
    await getGlobalCredentialStore().set("refresh-custom", "workspace", {
      type: "api",
      key: "refresh-secret",
    });
    spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async () => {
          calls.push("catalog");
          return Response.json({
            ...snapshot,
            "refresh-custom": {
              ...snapshot.openai!,
              id: "refresh-custom",
              models: {
                "live-model": {
                  ...Object.values(snapshot.openai!.models)[0]!,
                  id: "live-model",
                  name: "Catalog name",
                  cost: { input: 1, output: 2 },
                },
                "catalog-only": {
                  ...Object.values(snapshot.openai!.models)[0]!,
                  id: "catalog-only",
                  name: "Catalog only",
                },
              },
            },
            "new-refresh-provider": {
              id: "new-refresh-provider",
              name: "New Provider",
              npm: "@example/provider",
              env: [],
              doc: "",
              models: {
                "new-refresh-model": {
                  id: "new-refresh-model",
                  name: "New Model",
                  attachment: false,
                  reasoning: false,
                  tool_call: true,
                  open_weights: false,
                  release_date: "2026-01-01",
                  last_updated: "2026-01-01",
                  modalities: { input: ["text"], output: ["text"] },
                  limit: { context: 8192, output: 1024 },
                },
              },
            },
          });
        },
        { preconnect: originalFetch.preconnect },
      ),
    );
    const kernel = await createDaemonKernel({
      runs: { runsDir: join(directory, "runs") },
    });
    const server = createDaemonServer({ daemon: kernel, port: 0 });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      const requestId = crypto.randomUUID();
      client.send({
        type: "command",
        requestId,
        command: "core.providers.refresh",
        arguments: { providerId: "refresh-custom", scope: "workspace" },
      });
      const result = await client.next();
      expect(result).toMatchObject({ type: "response", requestId, ok: true });
      if (
        result.type !== "response" ||
        !("ok" in result) ||
        !result.ok ||
        !("data" in result)
      )
        throw new Error("Refresh failed");
      expect(result.data).toMatchObject({
        id: "refresh-custom",
        models: [
          { id: "catalog-only", sources: ["models.dev"] },
          {
            id: "live-model",
            sources: ["provider", "models.dev", "user"],
            metadata: {
              name: "Live name",
              capabilities: { teeAttestation: true, e2ee: false },
              cost: { input: 0, output: 2 },
            },
          },
          { id: "manual-model", sources: ["user"], metadata: {} },
        ],
        discovery: { status: "live" },
      });
      expect(JSON.stringify(result)).not.toContain("refresh-secret");
      expect(calls).toEqual(["catalog", "live"]);
      expect(getProvidersForModel("new-refresh-model")).toEqual([
        "new-refresh-provider",
      ]);
      spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 503 }),
      );
      await kernel.plugins.core.providers.refresh({
        providerId: "refresh-custom",
        scope: "workspace",
      });
      expect(getCatalogSnapshot()["new-refresh-provider"]).toBeDefined();
    } finally {
      client.socket.close();
      await server.stop();
      await kernel.dispose();
    }
  });
  it("should reject an unknown provider before making network requests", async () => {
    const request = spyOn(globalThis, "fetch");
    request.mockClear();
    const plugin = createCorePlugin();
    try {
      await expect(
        plugin.providers.refresh({ providerId: "missing-provider" }),
      ).rejects.toThrow("Provider was not found");
      expect(request).not.toHaveBeenCalled();
    } finally {
      await plugin.dispose();
    }
  });
});
