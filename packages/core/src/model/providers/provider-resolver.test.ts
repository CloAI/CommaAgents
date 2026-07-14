// Tests for the process-wide credential store, provider registry, and resolver.

import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type {
  Credential,
  CredentialStore,
} from "../../credentials/credentials.types";
import {
  getGlobalCredentialStore,
  resetGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../credentials/global-credential-store";
import { resetCoreLocationOverrides } from "../../defaults/defaults";
import type { ProviderFactory } from "../model.types";
import {
  getGlobalProviderResolver,
  resetGlobalProviderResolver,
  setProviderInstallDirectory,
} from "./provider-resolver";
import {
  getCustomProviderIdsSync,
  registerProviderDefinition,
  unregisterProviderDefinition,
} from "./providers";

// -- Helpers --

/** Create a mock credential store that resolves specific providers. */
function createMockCredentialStore(
  credentials: Record<string, Credential>,
): CredentialStore {
  return {
    async resolve(providerId: string) {
      return credentials[providerId];
    },
    async get(providerId: string, _scope: string) {
      return credentials[providerId];
    },
    async set() {},
    async remove() {
      return false;
    },
    async list() {
      return Object.keys(credentials);
    },
    async listScopes() {
      return ["$global"];
    },
    async getAuthStatus(providerId: string) {
      return credentials[providerId]
        ? ("configured" as const)
        : ("none" as const);
    },
  };
}

const testApiCredential: Credential = { type: "api", key: "test-key-123" };
const testOAuthCredential: Credential = {
  type: "oauth",
  accessToken: "oauth-token-456",
};

function getGlobalState() {
  return {
    credentialStore: getGlobalCredentialStore(),
    providerResolver: getGlobalProviderResolver(),
    registeredProviderIds: getCustomProviderIdsSync(),
  };
}

function resetGlobalState(): void {
  resetGlobalCredentialStore();
  resetGlobalProviderResolver();
  resetCoreLocationOverrides();
}

afterEach(() => {
  resetGlobalState();
});

// -- Credential store --

describe("getGlobalCredentialStore", () => {
  it("should return a default credential store when none is set", () => {
    const store = getGlobalCredentialStore();
    expect(store).toBeDefined();
    expect(typeof store.resolve).toBe("function");
    expect(typeof store.get).toBe("function");
    expect(typeof store.set).toBe("function");
    expect(typeof store.remove).toBe("function");
    expect(typeof store.list).toBe("function");
  });

  it("should return the same instance on repeated calls", () => {
    const store1 = getGlobalCredentialStore();
    const store2 = getGlobalCredentialStore();
    expect(store1).toBe(store2);
  });

  it("should return custom store when one is set", () => {
    const customStore = createMockCredentialStore({
      openai: testApiCredential,
    });
    setGlobalCredentialStore(customStore);

    const store = getGlobalCredentialStore();
    expect(store).toBe(customStore);
  });

  it("should revert to default store when custom store is cleared", () => {
    const customStore = createMockCredentialStore({});
    setGlobalCredentialStore(customStore);
    expect(getGlobalCredentialStore()).toBe(customStore);

    setGlobalCredentialStore(undefined);
    const store = getGlobalCredentialStore();
    expect(store).not.toBe(customStore);
    expect(typeof store.resolve).toBe("function");
  });
});

// -- Provider registry --

describe("registerProviderDefinition", () => {
  it("should register a provider with a direct factory", async () => {
    const mockFactory: ProviderFactory = (_modelId: string) => ({}) as any;

    registerProviderDefinition({
      id: "my-provider",
      name: "My Provider",
      factory: (_credential: Credential) => mockFactory,
    });

    const defaults = getGlobalState();
    expect(defaults.registeredProviderIds).toEqual(["my-provider"]);
  });

  it("should register a provider with a package name", () => {
    registerProviderDefinition({
      id: "deepinfra",
      name: "DeepInfra",
      packageName: "@deepinfra/ai-sdk",
      factoryName: "createDeepInfra",
    });

    const defaults = getGlobalState();
    expect(defaults.registeredProviderIds).toEqual(["deepinfra"]);
  });

  it("should overwrite an existing registration", () => {
    const factory1: ProviderFactory = () => ({}) as any;
    const factory2: ProviderFactory = () => ({}) as any;

    registerProviderDefinition({
      id: "my-provider",
      name: "My Provider",
      factory: () => factory1,
    });
    registerProviderDefinition({
      id: "my-provider",
      name: "My Provider",
      factory: () => factory2,
    });

    const defaults = getGlobalState();
    expect(defaults.registeredProviderIds).toEqual(["my-provider"]);
  });
});

describe("unregisterProviderDefinition", () => {
  it("should remove a registered provider", () => {
    registerProviderDefinition({
      id: "my-provider",
      name: "My Provider",
      factory: () => () => ({}) as any,
    });
    expect(unregisterProviderDefinition("my-provider")).toBe(true);

    const defaults = getGlobalState();
    expect(defaults.registeredProviderIds).toEqual([]);
  });

  it("should return false for unregistered provider", () => {
    expect(unregisterProviderDefinition("nonexistent")).toBe(false);
  });
});

// -- Provider resolver --

describe("getGlobalProviderResolver", () => {
  it("should return a function", () => {
    const resolver = getGlobalProviderResolver();
    expect(typeof resolver).toBe("function");
  });

  it("should resolve a registered provider with direct factory", async () => {
    const mockFactory: ProviderFactory = (modelId: string) =>
      ({ modelId, mock: true }) as any;

    registerProviderDefinition({
      id: "test-provider",
      name: "Test Provider",
      factory: (_credential: Credential) => mockFactory,
    });

    const resolver = getGlobalProviderResolver();
    const factory = await resolver("test-provider", testApiCredential);
    expect(typeof factory).toBe("function");

    const model = factory("test-model");
    expect(model).toHaveProperty("modelId", "test-model");
    expect(model).toHaveProperty("mock", true);
  });

  it("should resolve a registered provider with async factory", async () => {
    const mockFactory: ProviderFactory = (modelId: string) =>
      ({ modelId, async: true }) as any;

    registerProviderDefinition({
      id: "async-provider",
      name: "Async Provider",
      factory: async (_credential: Credential) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return mockFactory;
      },
    });

    const resolver = getGlobalProviderResolver();
    const factory = await resolver("async-provider", testApiCredential);
    const model = factory("my-model");
    expect(model).toHaveProperty("modelId", "my-model");
    expect(model).toHaveProperty("async", true);
  });

  it("should throw for unresolvable provider when package does not exist", async () => {
    const resolver = getGlobalProviderResolver();

    await expect(
      resolver("nonexistent-provider-xyz", testApiCredential),
    ).rejects.toThrow(/Failed to load provider package/);
  });

  it("should prefer registered providers over built-in known providers", async () => {
    const customFactory: ProviderFactory = (modelId: string) =>
      ({ modelId, custom: true }) as any;

    // Register a custom "openai" that takes precedence over built-in
    registerProviderDefinition({
      id: "openai",
      name: "OpenAI",
      factory: (_credential: Credential) => customFactory,
    });

    const resolver = getGlobalProviderResolver();
    const factory = await resolver("openai", testApiCredential);
    const model = factory("gpt-4o");
    expect(model).toHaveProperty("modelId", "gpt-4o");
    expect(model).toHaveProperty("custom", true);
  });

  it("should pass correct credential to factory", async () => {
    let receivedCredential: Credential | undefined;

    registerProviderDefinition({
      id: "cred-test",
      name: "Cred Test",
      factory: (credential: Credential) => {
        receivedCredential = credential;
        return ((_modelId: string) => ({})) as any;
      },
    });

    const resolver = getGlobalProviderResolver();
    await resolver("cred-test", testOAuthCredential);

    expect(receivedCredential).toEqual(testOAuthCredential);
  });
});

// -- Reset --

describe("resetGlobalState", () => {
  it("should clear the provider registry", () => {
    registerProviderDefinition({
      id: "test",
      name: "Test",
      factory: () => () => ({}) as any,
    });
    expect(getGlobalState().registeredProviderIds).toHaveLength(1);

    resetGlobalState();
    expect(getGlobalState().registeredProviderIds).toHaveLength(0);
  });

  it("should clear the custom credential store", () => {
    const customStore = createMockCredentialStore({});
    setGlobalCredentialStore(customStore);
    expect(getGlobalCredentialStore()).toBe(customStore);

    resetGlobalState();
    expect(getGlobalCredentialStore()).not.toBe(customStore);
  });

  it("should discard the lazily-created default store", () => {
    const store1 = getGlobalCredentialStore();
    resetGlobalState();
    const store2 = getGlobalCredentialStore();
    expect(store1).not.toBe(store2);
  });
});

// -- Combined state --

describe("global state", () => {
  it("should return all three fields", () => {
    const defaults = getGlobalState();
    expect(defaults.credentialStore).toBeDefined();
    expect(typeof defaults.providerResolver).toBe("function");
    expect(Array.isArray(defaults.registeredProviderIds)).toBe(true);
  });

  it("should reflect registered providers", () => {
    registerProviderDefinition({
      id: "alpha",
      name: "Alpha",
      factory: () => () => ({}) as any,
    });
    registerProviderDefinition({
      id: "beta",
      name: "Beta",
      packageName: "beta-pkg",
    });

    const defaults = getGlobalState();
    expect(defaults.registeredProviderIds).toEqual(["alpha", "beta"]);
  });
});

// -- Dynamic provider package install via cache dir --

describe("dynamic provider install (setProviderInstallDirectory)", () => {
  const CACHE_DIR = join(
    "/tmp",
    `comma-provider-test-${process.pid}-${Date.now()}`,
  );

  it("should auto-install and load a provider package from the cache dir", () => {
    try {
      rmSync(CACHE_DIR, { recursive: true, force: true });
    } catch {
      // ok
    }
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      join(CACHE_DIR, "package.json"),
      JSON.stringify({ name: "test-cache", private: true }),
    );

    const installResult = Bun.spawnSync(
      ["bun", "add", "@openrouter/ai-sdk-provider"],
      {
        cwd: CACHE_DIR,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    expect(installResult.exitCode).toBe(0);

    expect(
      existsSync(
        join(CACHE_DIR, "node_modules", "@openrouter", "ai-sdk-provider"),
      ),
    ).toBe(true);
    expect(existsSync(join(CACHE_DIR, "node_modules", "zod"))).toBe(true);

    const _require = createRequire(join(CACHE_DIR, "package.json"));
    const mod = _require("@openrouter/ai-sdk-provider") as Record<
      string,
      unknown
    >;
    expect(typeof mod.createOpenRouter).toBe("function");

    try {
      rmSync(CACHE_DIR, { recursive: true, force: true });
    } catch {
      // ok
    }
  });

  it("should install the package into the cache directory on first use via resolver", async () => {
    try {
      rmSync(CACHE_DIR, { recursive: true, force: true });
    } catch {
      // ok
    }
    resetGlobalState();
    setProviderInstallDirectory(CACHE_DIR);

    expect(existsSync(join(CACHE_DIR, "node_modules"))).toBe(false);

    registerProviderDefinition({
      id: "openrouter",
      name: "OpenRouter",
      packageName: "@openrouter/ai-sdk-provider",
      factoryName: "createOpenRouter",
    });

    const resolver = getGlobalProviderResolver();
    const apiCredential: Credential = { type: "api", key: "test-key" };

    let resolutionSucceeded = false;
    let resolutionError: string | undefined;
    try {
      const factory = await resolver("openrouter", apiCredential);
      resolutionSucceeded = typeof factory === "function";
    } catch (caughtError) {
      resolutionError =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
    }

    // Must not fail with "Cannot find module" — the cache should handle it
    if (resolutionError) {
      expect(resolutionError).not.toContain("Cannot find module");
      expect(resolutionError).not.toContain("Install it with");
    }

    // The cache directory must contain the installed package
    expect(existsSync(join(CACHE_DIR, "node_modules", "@openrouter"))).toBe(
      true,
    );

    if (resolutionSucceeded) {
      // Verify transitive dep zod is available
      expect(existsSync(join(CACHE_DIR, "node_modules", "zod"))).toBe(true);
    }

    try {
      rmSync(CACHE_DIR, { recursive: true, force: true });
    } catch {
      // ok
    }
  });
});
