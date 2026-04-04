// Tests for global defaults — credential store, provider registry, and resolver.

import { afterEach, describe, expect, it, mock } from "bun:test";
import type { Credential, CredentialStore } from "../credentials/credentials.types";
import type { ProviderFactory } from "../model/model.types";
import {
  getGlobalCredentialStore,
  getGlobalDefaults,
  getGlobalProviderResolver,
  registerProvider,
  resetGlobalDefaults,
  setGlobalCredentialStore,
  unregisterProvider,
} from "./defaults";

// -- Helpers --

/** Create a mock credential store that resolves specific providers. */
function createMockCredentialStore(credentials: Record<string, Credential>): CredentialStore {
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
  };
}

const testApiCredential: Credential = { type: "api", key: "test-key-123" };
const testOAuthCredential: Credential = {
  type: "oauth",
  accessToken: "oauth-token-456",
};

afterEach(() => {
  resetGlobalDefaults();
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
    const customStore = createMockCredentialStore({ openai: testApiCredential });
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

describe("registerProvider", () => {
  it("should register a provider with a direct factory", async () => {
    const mockFactory: ProviderFactory = (_modelId: string) => ({}) as any;

    registerProvider("my-provider", {
      factory: (_credential: Credential) => mockFactory,
    });

    const defaults = getGlobalDefaults();
    expect(defaults.registeredProviderIds).toEqual(["my-provider"]);
  });

  it("should register a provider with a package name", () => {
    registerProvider("deepinfra", {
      packageName: "@deepinfra/ai-sdk",
      factoryName: "createDeepInfra",
    });

    const defaults = getGlobalDefaults();
    expect(defaults.registeredProviderIds).toEqual(["deepinfra"]);
  });

  it("should overwrite an existing registration", () => {
    const factory1: ProviderFactory = () => ({}) as any;
    const factory2: ProviderFactory = () => ({}) as any;

    registerProvider("my-provider", { factory: () => factory1 });
    registerProvider("my-provider", { factory: () => factory2 });

    const defaults = getGlobalDefaults();
    expect(defaults.registeredProviderIds).toEqual(["my-provider"]);
  });
});

describe("unregisterProvider", () => {
  it("should remove a registered provider", () => {
    registerProvider("my-provider", { factory: () => () => ({}) as any });
    expect(unregisterProvider("my-provider")).toBe(true);

    const defaults = getGlobalDefaults();
    expect(defaults.registeredProviderIds).toEqual([]);
  });

  it("should return false for unregistered provider", () => {
    expect(unregisterProvider("nonexistent")).toBe(false);
  });
});

// -- Provider resolver --

describe("getGlobalProviderResolver", () => {
  it("should return a function", () => {
    const resolver = getGlobalProviderResolver();
    expect(typeof resolver).toBe("function");
  });

  it("should resolve a registered provider with direct factory", async () => {
    const mockFactory: ProviderFactory = (modelId: string) => ({ modelId, mock: true }) as any;

    registerProvider("test-provider", {
      factory: (_credential: Credential) => mockFactory,
    });

    const resolver = getGlobalProviderResolver();
    const factory = await resolver("test-provider", testApiCredential);
    expect(typeof factory).toBe("function");

    const model = factory("test-model");
    expect(model).toEqual({ modelId: "test-model", mock: true });
  });

  it("should resolve a registered provider with async factory", async () => {
    const mockFactory: ProviderFactory = (modelId: string) => ({ modelId, async: true }) as any;

    registerProvider("async-provider", {
      factory: async (_credential: Credential) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return mockFactory;
      },
    });

    const resolver = getGlobalProviderResolver();
    const factory = await resolver("async-provider", testApiCredential);
    const model = factory("my-model");
    expect(model).toEqual({ modelId: "my-model", async: true });
  });

  it("should throw for unresolvable provider when package does not exist", async () => {
    const resolver = getGlobalProviderResolver();

    await expect(resolver("nonexistent-provider-xyz", testApiCredential)).rejects.toThrow(
      /Failed to load provider package/,
    );
  });

  it("should prefer registered providers over built-in known providers", async () => {
    const customFactory: ProviderFactory = (modelId: string) => ({ modelId, custom: true }) as any;

    // Register a custom "openai" that takes precedence over built-in
    registerProvider("openai", {
      factory: (_credential: Credential) => customFactory,
    });

    const resolver = getGlobalProviderResolver();
    const factory = await resolver("openai", testApiCredential);
    const model = factory("gpt-4o");
    expect(model).toEqual({ modelId: "gpt-4o", custom: true });
  });

  it("should pass correct credential to factory", async () => {
    let receivedCredential: Credential | undefined;

    registerProvider("cred-test", {
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

describe("resetGlobalDefaults", () => {
  it("should clear the provider registry", () => {
    registerProvider("test", { factory: () => () => ({}) as any });
    expect(getGlobalDefaults().registeredProviderIds).toHaveLength(1);

    resetGlobalDefaults();
    expect(getGlobalDefaults().registeredProviderIds).toHaveLength(0);
  });

  it("should clear the custom credential store", () => {
    const customStore = createMockCredentialStore({});
    setGlobalCredentialStore(customStore);
    expect(getGlobalCredentialStore()).toBe(customStore);

    resetGlobalDefaults();
    expect(getGlobalCredentialStore()).not.toBe(customStore);
  });

  it("should discard the lazily-created default store", () => {
    const store1 = getGlobalCredentialStore();
    resetGlobalDefaults();
    const store2 = getGlobalCredentialStore();
    expect(store1).not.toBe(store2);
  });
});

// -- getGlobalDefaults --

describe("getGlobalDefaults", () => {
  it("should return all three fields", () => {
    const defaults = getGlobalDefaults();
    expect(defaults.credentialStore).toBeDefined();
    expect(typeof defaults.providerResolver).toBe("function");
    expect(Array.isArray(defaults.registeredProviderIds)).toBe(true);
  });

  it("should reflect registered providers", () => {
    registerProvider("alpha", { factory: () => () => ({}) as any });
    registerProvider("beta", { packageName: "beta-pkg" });

    const defaults = getGlobalDefaults();
    expect(defaults.registeredProviderIds).toEqual(["alpha", "beta"]);
  });
});
