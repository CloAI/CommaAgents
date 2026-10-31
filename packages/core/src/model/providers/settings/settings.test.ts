import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText } from "ai";
import {
  createJsonFileCredentialBackend,
  createCredentialStore,
  getGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../../credentials";
import {
  getCatalogCachePath,
  getCredentialsPath,
  getProviderSettingsPath,
  setCatalogCachePath,
  setCredentialsPath,
  setProviderSettingsPath,
} from "../../../defaults/defaults";
import { resolveModel } from "../../model";
import { getCatalogSnapshot, resetCatalog } from "../catalog";
import {
  getProviderDefinition,
  listProviderModels,
  registerProviderDefinition,
  resetProviderRegistry,
} from "../providers";
import {
  addCustomProvider,
  addCustomProviderModel,
  configureProvider,
  getProviderConfiguration,
  reloadProviderSettings,
  removeCustomProvider,
  removeCustomProviderModel,
  removeProviderCredential,
  updateCustomProvider,
} from "./settings.api";
import { getProviderSettings } from "./settings";
import { ProviderSettingsSchema } from "./settings.schemas";
import { ModelMetadataSchema } from "../providers.schemas";

const originalFetch = globalThis.fetch;
const originalSettingsPath = getProviderSettingsPath();
const originalCredentialsPath = getCredentialsPath();
const originalCatalogPath = getCatalogCachePath();
const originalCredentialStore = getGlobalCredentialStore();
const catalog = getCatalogSnapshot();
let testDirectory: string;

const endpoint = {
  id: "test-local",
  name: "Test Local",
  baseURL: "http://127.0.0.1:1234/v1",
  credentialType: "api" as const,
};

beforeEach(() => {
  testDirectory = mkdtempSync(join(tmpdir(), "comma-provider-settings-"));
  setProviderSettingsPath(join(testDirectory, "settings.json"));
  setCredentialsPath(join(testDirectory, "credentials.json"));
  setCatalogCachePath(join(testDirectory, "catalog.json"));
  writeFileSync(
    getCatalogCachePath(),
    JSON.stringify({ fetchedAt: Date.now(), data: catalog }),
  );
  resetCatalog();
  resetProviderRegistry();
  setGlobalCredentialStore(
    createCredentialStore({
      backend: createJsonFileCredentialBackend({
        filePath: getCredentialsPath(),
      }),
      env: {},
    }),
  );
  globalThis.fetch = mock(async () => {
    throw new Error("Unexpected network request in settings test");
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setGlobalCredentialStore(originalCredentialStore);
  setProviderSettingsPath(originalSettingsPath);
  setCredentialsPath(originalCredentialsPath);
  setCatalogCachePath(originalCatalogPath);
  resetProviderRegistry();
  resetCatalog();
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("provider settings persistence", () => {
  test("rejects invalid endpoint URLs with safe errors and no persisted changes", async () => {
    for (const baseURL of [
      "invalid-secret-value",
      "https://name:secret@example.com/v1",
      "https://example.com/v1?key=secret",
    ]) {
      await expect(
        addCustomProvider({ ...endpoint, baseURL }),
      ).rejects.toMatchObject({
        code: "INVALID_ARGUMENTS",
        message: "Invalid provider options.",
      });
    }
    expect(getProviderSettings().providers).toEqual([]);
  });
  test("hydrates custom endpoints and manual model IDs lazily after registry reset", async () => {
    writeFileSync(
      getProviderSettingsPath(),
      JSON.stringify({
        version: 3,
        providers: [
          {
            kind: "custom",
            id: endpoint.id,
            definition: {
              name: endpoint.name,
              baseURL: endpoint.baseURL,
              credentialType: endpoint.credentialType,
            },
            models: [{ id: "org/model" }],
          },
          { kind: "existing", id: "openai", models: [{ id: "manual-model" }] },
        ],
      }),
    );
    const [first, second] = await Promise.all([
      getProviderDefinition(endpoint.id),
      getProviderDefinition(endpoint.id),
    ]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ...endpoint, origin: "user" });
    expect(
      (await listProviderModels(endpoint.id, undefined, { live: false }))
        .models,
    ).toEqual([{ id: "org/model", sources: ["user"], metadata: {} }]);
    expect(
      (
        await listProviderModels("openai", undefined, { live: false })
      ).models.some((model) => model.id === "manual-model"),
    ).toBe(true);
    resetProviderRegistry();
    expect(await getProviderDefinition(endpoint.id)).toMatchObject({
      name: endpoint.name,
    });
  });

  test("rejects invalid definitions, duplicate IDs and unknown fields", () => {
    const definition = {
      name: endpoint.name,
      baseURL: endpoint.baseURL,
      credentialType: endpoint.credentialType,
    };
    const valid = {
      version: 3,
      providers: [
        {
          kind: "custom",
          id: endpoint.id,
          definition,
          models: [{ id: "org/model" }],
        },
      ],
    };
    expect(ProviderSettingsSchema.safeParse(valid).success).toBe(true);
    for (const providers of [
      [
        {
          kind: "existing",
          id: "openai",
          models: [{ id: "same" }, { id: "same" }],
        },
      ],
      [valid.providers[0], valid.providers[0]],
      [{ ...valid.providers[0], models: [{ id: "" }] }],
      [
        {
          ...valid.providers[0],
          definition: {
            ...definition,
            baseURL: "https://user:secret@example.com/v1",
          },
        },
      ],
      [
        {
          ...valid.providers[0],
          definition: {
            ...definition,
            baseURL: "https://example.com/v1?key=secret",
          },
        },
      ],
      [{ kind: "existing", id: "openai", models: [], apiKey: "secret" }],
      [{ id: "openai", models: [] }],
    ])
      expect(
        ProviderSettingsSchema.safeParse({ version: 3, providers }).success,
      ).toBe(false);
    expect(
      ProviderSettingsSchema.safeParse({ ...valid, version: 4 }).success,
    ).toBe(false);
  });

  test("custom IDs cannot replace catalog or independently registered definitions", async () => {
    await expect(
      addCustomProvider({ ...endpoint, id: "openai" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    registerProviderDefinition({ id: "runtime-owned", name: "Runtime" });
    await expect(
      addCustomProvider({ ...endpoint, id: "runtime-owned" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateCustomProvider({ providerId: "runtime-owned", name: "Changed" }),
    ).rejects.toMatchObject({ code: "NOT_USER_DEFINED" });
    await expect(
      removeCustomProvider({ providerId: "openai" }),
    ).rejects.toMatchObject({ code: "NOT_USER_DEFINED" });
  });

  test("updates editable fields while preserving identity, models and credentials", async () => {
    await addCustomProvider({ ...endpoint, models: [{ id: "manual" }] });
    await configureProvider({
      providerId: endpoint.id,
      apiKey: "saved-secret",
    });
    await updateCustomProvider({
      providerId: endpoint.id,
      name: "Renamed",
      baseURL: "https://example.com/api/v1",
    });
    expect(
      await getProviderConfiguration({ providerId: endpoint.id }),
    ).toMatchObject({
      providerId: endpoint.id,
      customProvider: {
        name: "Renamed",
        baseURL: "https://example.com/api/v1",
      },
      customModels: [{ id: "manual" }],
      hasSavedCredential: true,
    });
    await expect(
      updateCustomProvider({
        providerId: endpoint.id,
        id: "renamed-id",
      } as unknown as Parameters<typeof updateCustomProvider>[0]),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    expect(await getProviderDefinition("renamed-id")).toBeUndefined();
  });

  test("manual IDs are additive and idempotent; removing a catalog duplicate retains catalog metadata", async () => {
    const catalogResult = await listProviderModels("openai", undefined, {
      live: false,
    });
    const catalogModel = catalogResult.models[0]!;
    await addCustomProviderModel({
      providerId: "openai",
      modelId: catalogModel.id,
    });
    await addCustomProviderModel({
      providerId: "openai",
      modelId: "org/manual",
    });
    await addCustomProviderModel({
      providerId: "openai",
      modelId: "org/manual",
    });
    expect(
      (await getProviderConfiguration({ providerId: "openai" })).customModels,
    ).toEqual([{ id: catalogModel.id }, { id: "org/manual" }]);
    const result = await listProviderModels("openai", undefined, {
      live: false,
    });
    expect(
      result.models.filter((model) => model.id === catalogModel.id),
    ).toEqual([{ ...catalogModel, sources: ["models.dev", "user"] }]);
    expect(result.models.find((model) => model.id === "org/manual")).toEqual({
      id: "org/manual",
      sources: ["user"],
      metadata: {},
    });
    await removeCustomProviderModel({
      providerId: "openai",
      modelId: catalogModel.id,
    });
    expect(
      (
        await listProviderModels("openai", undefined, { live: false })
      ).models.find((model) => model.id === catalogModel.id),
    ).toEqual(catalogModel);
    await removeCustomProviderModel({
      providerId: "openai",
      modelId: "org/manual",
    });
    await removeCustomProviderModel({
      providerId: "openai",
      modelId: "org/manual",
    });
    expect(getProviderSettings().providers).toEqual([]);
  });

  test("concurrent provider and model mutations preserve every accepted write", async () => {
    await Promise.all([
      addCustomProvider(endpoint),
      addCustomProvider({ ...endpoint, id: "second-local" }),
      addCustomProviderModel({ providerId: "openai", modelId: "one" }),
      addCustomProviderModel({ providerId: "openai", modelId: "two" }),
    ]);
    expect(
      getProviderSettings()
        .providers.map((provider) => provider.id)
        .sort(),
    ).toEqual(["openai", "second-local", endpoint.id]);
    expect(
      (await getProviderConfiguration({ providerId: "openai" })).customModels,
    ).toEqual([{ id: "one" }, { id: "two" }]);
    expect(JSON.parse(readFileSync(getProviderSettingsPath(), "utf8"))).toEqual(
      getProviderSettings(),
    );
  });

  test("failed reload preserves active settings, and repaired reload replaces only user-owned definitions", async () => {
    await addCustomProvider(endpoint);
    registerProviderDefinition({ id: "runtime-owned", name: "Runtime" });
    writeFileSync(getProviderSettingsPath(), "malformed-secret-value");
    await expect(reloadProviderSettings()).rejects.toMatchObject({
      code: "PROVIDER_STORAGE_ERROR",
    });
    expect(await getProviderDefinition(endpoint.id)).toMatchObject({
      name: endpoint.name,
    });
    expect(getProviderSettings().providers).toHaveLength(1);
    await expect(
      addCustomProvider({ ...endpoint, id: "another-local" }),
    ).rejects.toMatchObject({ code: "PROVIDER_STORAGE_ERROR" });
    expect(readFileSync(getProviderSettingsPath(), "utf8")).toBe(
      "malformed-secret-value",
    );
    writeFileSync(
      getProviderSettingsPath(),
      JSON.stringify({
        version: 3,
        providers: [
          {
            kind: "custom",
            id: "replacement-local",
            definition: {
              name: endpoint.name,
              baseURL: endpoint.baseURL,
              credentialType: endpoint.credentialType,
            },
            models: [],
          },
        ],
      }),
    );
    await reloadProviderSettings();
    expect(await getProviderDefinition(endpoint.id)).toBeUndefined();
    expect(await getProviderDefinition("replacement-local")).toMatchObject({
      origin: "user",
    });
    expect(await getProviderDefinition("runtime-owned")).toMatchObject({
      name: "Runtime",
    });
  });

  test("runtime ownership conflict rejects an unrelated mutation before persistence", async () => {
    await addCustomProvider(endpoint);
    const previousFile = readFileSync(getProviderSettingsPath(), "utf8");
    const previousSettings = getProviderSettings();
    registerProviderDefinition({
      id: endpoint.id,
      name: "Runtime replacement",
    });
    await expect(
      addCustomProviderModel({
        providerId: "openai",
        modelId: "unrelated-model",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(readFileSync(getProviderSettingsPath(), "utf8")).toBe(previousFile);
    expect(getProviderSettings()).toEqual(previousSettings);
    expect(await getProviderDefinition(endpoint.id)).toMatchObject({
      name: "Runtime replacement",
    });
  });

  test("reload rejects manual models for an unknown provider while retaining active definitions", async () => {
    await addCustomProvider(endpoint);
    const previousSettings = getProviderSettings();
    writeFileSync(
      getProviderSettingsPath(),
      JSON.stringify({
        version: 3,
        providers: [
          {
            kind: "existing",
            id: "unknown-provider",
            models: [{ id: "manual-model" }],
          },
        ],
      }),
    );
    await expect(reloadProviderSettings()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(getProviderSettings()).toEqual(previousSettings);
    expect(await getProviderDefinition(endpoint.id)).toMatchObject({
      name: endpoint.name,
      origin: "user",
    });
    expect(await getProviderDefinition("unknown-provider")).toBeUndefined();
  });

  test("configuration returns source metadata without secrets and environment credentials survive removal", async () => {
    const store = createCredentialStore({
      backend: createJsonFileCredentialBackend({
        filePath: getCredentialsPath(),
      }),
      env: { OPENAI_API_KEY: "env-secret" },
    });
    setGlobalCredentialStore(store);
    const configured = await configureProvider({
      providerId: "openai",
      apiKey: "saved-secret",
    });
    expect(configured).toMatchObject({
      authStatus: "configured",
      hasSavedCredential: true,
      credentialSource: "environment",
    });
    expect(JSON.stringify(configured)).not.toContain("secret");
    expect(await store.resolve("openai")).toEqual({
      type: "api",
      key: "env-secret",
    });
    expect(
      await removeProviderCredential({ providerId: "openai" }),
    ).toMatchObject({
      authStatus: "configured",
      hasSavedCredential: false,
      credentialSource: "environment",
    });
  });

  test("credential removal failure preserves a custom provider and its settings", async () => {
    await addCustomProvider(endpoint);
    const memory = createJsonFileCredentialBackend({
      filePath: getCredentialsPath(),
    });
    const store = createCredentialStore({ backend: memory, env: {} });
    setGlobalCredentialStore(store);
    await configureProvider({
      providerId: endpoint.id,
      apiKey: "saved-secret",
    });
    const before = readFileSync(getProviderSettingsPath(), "utf8");
    setGlobalCredentialStore(
      createCredentialStore({
        backend: {
          readAll: memory.readAll,
          async writeAll() {
            throw new Error("secret-write-error");
          },
        },
        env: {},
      }),
    );
    await expect(
      removeCustomProvider({ providerId: endpoint.id }),
    ).rejects.toMatchObject({ code: "CREDENTIAL_STORAGE_ERROR" });
    expect(readFileSync(getProviderSettingsPath(), "utf8")).toBe(before);
    expect(await getProviderDefinition(endpoint.id)).toMatchObject({
      origin: "user",
    });
    expect(await store.get(endpoint.id, "$global")).toMatchObject({
      key: "saved-secret",
    });
  });

  test("settings removal failure reports partial completion and permits a later retry", async () => {
    await addCustomProvider(endpoint);
    await configureProvider({
      providerId: endpoint.id,
      apiKey: "saved-secret",
    });
    const before = readFileSync(getProviderSettingsPath(), "utf8");
    writeFileSync(getProviderSettingsPath(), "corrupt-settings");
    await expect(
      removeCustomProvider({ providerId: endpoint.id }),
    ).rejects.toMatchObject({ code: "PROVIDER_REMOVAL_PARTIAL" });
    expect(
      await getGlobalCredentialStore().get(endpoint.id, "$global"),
    ).toBeUndefined();
    expect(await getProviderDefinition(endpoint.id)).toMatchObject({
      origin: "user",
    });
    writeFileSync(getProviderSettingsPath(), before);
    expect(await removeCustomProvider({ providerId: endpoint.id })).toEqual({
      providerId: endpoint.id,
      removed: true,
    });
    expect(await removeCustomProvider({ providerId: endpoint.id })).toEqual({
      providerId: endpoint.id,
      removed: false,
    });
  });

  test("rejects previous schema versions without rewriting configuration", () => {
    for (const version of [1, 2]) {
      const previous = JSON.stringify({ version, providers: [] });
      writeFileSync(getProviderSettingsPath(), previous);
      expect(() => getProviderSettings()).toThrow("unsupported version");
      expect(readFileSync(getProviderSettingsPath(), "utf8")).toBe(previous);
    }
  });

  test("model metadata persists every supported field and repeated IDs do not overwrite it", async () => {
    await addCustomProvider(endpoint);
    const metadata = {
      name: "Named model",
      family: "model-family",
      contextWindow: 100000,
      maxInputTokens: 90000,
      maxOutputTokens: 10000,
      knowledgeCutoff: "2026-01",
      releaseDate: "2026-02-03",
      lastUpdated: "2026-03-04",
      status: "beta" as const,
      modalities: {
        input: ["text", "image"] as const,
        output: ["text"] as const,
      },
      capabilities: {
        tools: true,
        reasoning: false,
        vision: true,
        attachment: false,
        structuredOutput: true,
        teeAttestation: true,
        e2ee: false,
      },
      cost: {
        input: 1,
        output: 2,
        reasoning: 3,
        cacheRead: 0,
        cacheWrite: 0.5,
      },
    };
    const result = await addCustomProviderModel({
      providerId: endpoint.id,
      modelId: "org/rich",
      metadata,
    });
    expect(result.models).toEqual([
      { id: "org/rich", sources: ["user"], metadata },
    ]);
    await addCustomProviderModel({
      providerId: endpoint.id,
      modelId: "org/rich",
      metadata: { name: "Must not replace" },
    });
    expect(
      (await getProviderConfiguration({ providerId: endpoint.id }))
        .customModels,
    ).toEqual([{ id: "org/rich", metadata }]);
    resetProviderRegistry();
    await reloadProviderSettings();
    expect(
      (await listProviderModels(endpoint.id, undefined, { live: false }))
        .models,
    ).toEqual([{ id: "org/rich", sources: ["user"], metadata }]);
    const file = JSON.parse(readFileSync(getProviderSettingsPath(), "utf8"));
    expect(file.version).toBe(3);
    expect(file.providers[0].models).toEqual([{ id: "org/rich", metadata }]);
  });

  test("invalid metadata is rejected before persistence", async () => {
    await addCustomProvider(endpoint);
    const before = readFileSync(getProviderSettingsPath(), "utf8");
    for (const metadata of [
      { contextWindow: -1 },
      { maxInputTokens: 1.5 },
      { cost: { input: -0.1 } },
      { capabilities: { tools: "yes" } },
      { modalities: { input: ["invalid"] } },
      { id: "cannot-change-id" },
      { origin: "user" },
      { status: "unknown" },
    ]) {
      expect(ModelMetadataSchema.safeParse(metadata).success).toBe(false);
      await expect(
        addCustomProviderModel({
          providerId: endpoint.id,
          modelId: "invalid",
          metadata,
        } as unknown as Parameters<typeof addCustomProviderModel>[0]),
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    }
    expect(readFileSync(getProviderSettingsPath(), "utf8")).toBe(before);
    expect(
      (await getProviderConfiguration({ providerId: endpoint.id }))
        .customModels,
    ).toEqual([]);
  });

  test("custom no-auth inference uses the saved HTTP API prefix and emits no API key", async () => {
    await addCustomProvider({
      ...endpoint,
      credentialType: "none",
      models: [{ id: "local-model" }],
    });
    let requestURL = "";
    let requestHeaders = new Headers();
    globalThis.fetch = mock(
      async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
        requestURL = String(input);
        requestHeaders = new Headers(options?.headers);
        return Response.json({
          id: "chat-test",
          object: "chat.completion",
          created: 1,
          model: "local-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      },
    ) as unknown as typeof fetch;
    const model = await resolveModel(`${endpoint.id}/local-model`);
    const result = await generateText({
      model,
      prompt: "test",
      maxOutputTokens: 1,
      maxRetries: 0,
    });
    expect(result.text).toBe("ok");
    expect(requestURL).toBe(`${endpoint.baseURL}/chat/completions`);
    expect(requestHeaders.has("authorization")).toBe(false);
    expect(
      await getGlobalCredentialStore().get(endpoint.id, "$global"),
    ).toBeUndefined();
  });
});
