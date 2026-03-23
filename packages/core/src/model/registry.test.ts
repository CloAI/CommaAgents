// Tests for model registry — parseModel, resolveKey, resolveInterpolation

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ModelResolutionError } from "../errors/index";
import {
  getProviderPackage,
  isKnownProvider,
  KNOWN_PROVIDERS,
  PROVIDER_ENV_KEYS,
  parseModel,
  resolveInterpolation,
  resolveKey,
} from "./registry";

// parseModel

describe("parseModel", () => {
  it("should parse a simple provider/model string", () => {
    const result = parseModel("openai/gpt-4o");
    expect(result.providerID).toBe("openai");
    expect(result.modelID).toBe("gpt-4o");
    expect(result.packageName).toBe("@ai-sdk/openai");
    expect(result.envKey).toBe("OPENAI_API_KEY");
  });

  it("should parse anthropic model strings", () => {
    const result = parseModel("anthropic/claude-sonnet-4-5");
    expect(result.providerID).toBe("anthropic");
    expect(result.modelID).toBe("claude-sonnet-4-5");
    expect(result.packageName).toBe("@ai-sdk/anthropic");
    expect(result.envKey).toBe("ANTHROPIC_API_KEY");
  });

  it("should handle model IDs with slashes (only first slash is separator)", () => {
    const result = parseModel("ollama/meta-llama/llama-3");
    expect(result.providerID).toBe("ollama");
    expect(result.modelID).toBe("meta-llama/llama-3");
    expect(result.packageName).toBe("ollama-ai-provider");
  });

  it("should return undefined packageName for unknown providers", () => {
    const result = parseModel("custom-provider/some-model");
    expect(result.providerID).toBe("custom-provider");
    expect(result.modelID).toBe("some-model");
    expect(result.packageName).toBeUndefined();
    expect(result.envKey).toBeUndefined();
  });

  it("should trim whitespace", () => {
    const result = parseModel("  openai/gpt-4o  ");
    expect(result.providerID).toBe("openai");
    expect(result.modelID).toBe("gpt-4o");
  });

  it("should throw ModelResolutionError for empty string", () => {
    expect(() => parseModel("")).toThrow(ModelResolutionError);
  });

  it("should throw ModelResolutionError for whitespace-only string", () => {
    expect(() => parseModel("   ")).toThrow(ModelResolutionError);
  });

  it("should throw ModelResolutionError for string without slash", () => {
    expect(() => parseModel("openai-gpt-4o")).toThrow(ModelResolutionError);
  });

  it("should throw ModelResolutionError for string starting with slash", () => {
    expect(() => parseModel("/gpt-4o")).toThrow(ModelResolutionError);
  });

  it("should throw ModelResolutionError for string ending with slash", () => {
    expect(() => parseModel("openai/")).toThrow(ModelResolutionError);
  });

  it("should include the model string in the error", () => {
    try {
      parseModel("bad-string");
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ModelResolutionError);
      expect((error as ModelResolutionError).modelString).toBe("bad-string");
    }
  });
});

// KNOWN_PROVIDERS

describe("KNOWN_PROVIDERS", () => {
  it("should contain openai", () => {
    expect(KNOWN_PROVIDERS.openai).toBe("@ai-sdk/openai");
  });

  it("should contain anthropic", () => {
    expect(KNOWN_PROVIDERS.anthropic).toBe("@ai-sdk/anthropic");
  });

  it("should contain google", () => {
    expect(KNOWN_PROVIDERS.google).toBe("@ai-sdk/google");
  });

  it("should contain ollama", () => {
    expect(KNOWN_PROVIDERS.ollama).toBe("ollama-ai-provider");
  });

  it("should have at least 10 known providers", () => {
    expect(Object.keys(KNOWN_PROVIDERS).length).toBeGreaterThanOrEqual(10);
  });
});

// PROVIDER_ENV_KEYS

describe("PROVIDER_ENV_KEYS", () => {
  it("should map openai to OPENAI_API_KEY", () => {
    expect(PROVIDER_ENV_KEYS.openai).toBe("OPENAI_API_KEY");
  });

  it("should map anthropic to ANTHROPIC_API_KEY", () => {
    expect(PROVIDER_ENV_KEYS.anthropic).toBe("ANTHROPIC_API_KEY");
  });

  it("should not have ollama (no key needed)", () => {
    expect(PROVIDER_ENV_KEYS.ollama).toBeUndefined();
  });
});

// isKnownProvider / getProviderPackage

describe("isKnownProvider", () => {
  it("should return true for known providers", () => {
    expect(isKnownProvider("openai")).toBe(true);
    expect(isKnownProvider("anthropic")).toBe(true);
    expect(isKnownProvider("ollama")).toBe(true);
  });

  it("should return false for unknown providers", () => {
    expect(isKnownProvider("custom")).toBe(false);
    expect(isKnownProvider("")).toBe(false);
  });
});

describe("getProviderPackage", () => {
  it("should return package name for known providers", () => {
    expect(getProviderPackage("openai")).toBe("@ai-sdk/openai");
  });

  it("should return undefined for unknown providers", () => {
    expect(getProviderPackage("custom")).toBeUndefined();
  });
});

// resolveKey

describe("resolveKey", () => {
  // Save and restore env vars around tests
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    originalEnv.CUSTOM_KEY = process.env.CUSTOM_KEY;
    // Clear for test isolation
    delete process.env.OPENAI_API_KEY;
    delete process.env.CUSTOM_KEY;
  });

  afterEach(() => {
    if (originalEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalEnv.CUSTOM_KEY !== undefined) {
      process.env.CUSTOM_KEY = originalEnv.CUSTOM_KEY;
    } else {
      delete process.env.CUSTOM_KEY;
    }
  });

  it("should return explicit apiKey with highest priority", async () => {
    process.env.OPENAI_API_KEY = "env-key";
    const result = await resolveKey("openai", { apiKey: "explicit-key" });
    expect(result).toBe("explicit-key");
  });

  it("should resolve from standard env var", async () => {
    process.env.OPENAI_API_KEY = "sk-env-123";
    const result = await resolveKey("openai");
    expect(result).toBe("sk-env-123");
  });

  it("should resolve from custom env var", async () => {
    process.env.CUSTOM_KEY = "custom-val";
    const result = await resolveKey("openai", { envVar: "CUSTOM_KEY" });
    expect(result).toBe("custom-val");
  });

  it("should resolve from credential store", async () => {
    const readCredential = async (providerID: string) => {
      if (providerID === "openai") return "store-key-123";
      return undefined;
    };

    const result = await resolveKey("openai", { readCredential });
    expect(result).toBe("store-key-123");
  });

  it("should prefer env var over credential store", async () => {
    process.env.OPENAI_API_KEY = "env-key";
    const readCredential = async () => "store-key";

    const result = await resolveKey("openai", { readCredential });
    expect(result).toBe("env-key");
  });

  it("should resolve from config interpolation as last resort", async () => {
    const result = await resolveKey("openai", { configValue: "raw-key-value" });
    expect(result).toBe("raw-key-value");
  });

  it("should resolve {env:VAR} config interpolation", async () => {
    process.env.CUSTOM_KEY = "interpolated-val";
    const result = await resolveKey("custom", { configValue: "{env:CUSTOM_KEY}" });
    expect(result).toBe("interpolated-val");
  });

  it("should return undefined when no key is found", async () => {
    const result = await resolveKey("ollama");
    expect(result).toBeUndefined();
  });

  it("should trim whitespace from env var values", async () => {
    process.env.OPENAI_API_KEY = "  sk-with-spaces  ";
    const result = await resolveKey("openai");
    expect(result).toBe("sk-with-spaces");
  });

  it("should skip empty env var values", async () => {
    process.env.OPENAI_API_KEY = "   ";
    const readCredential = async () => "fallback-store-key";
    const result = await resolveKey("openai", { readCredential });
    expect(result).toBe("fallback-store-key");
  });
});

// resolveInterpolation

describe("resolveInterpolation", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    originalEnv.TEST_INTERP_VAR = process.env.TEST_INTERP_VAR;
    delete process.env.TEST_INTERP_VAR;
  });

  afterEach(() => {
    if (originalEnv.TEST_INTERP_VAR !== undefined) {
      process.env.TEST_INTERP_VAR = originalEnv.TEST_INTERP_VAR;
    } else {
      delete process.env.TEST_INTERP_VAR;
    }
  });

  it("should resolve {env:VAR_NAME} pattern", async () => {
    process.env.TEST_INTERP_VAR = "my-secret";
    const result = await resolveInterpolation("{env:TEST_INTERP_VAR}");
    expect(result).toBe("my-secret");
  });

  it("should return undefined for missing env var", async () => {
    const result = await resolveInterpolation("{env:NONEXISTENT_VAR_12345}");
    expect(result).toBeUndefined();
  });

  it("should return undefined for {file:...} with nonexistent path", async () => {
    const result = await resolveInterpolation("{file:/nonexistent/path/key.txt}");
    expect(result).toBeUndefined();
  });

  it("should return raw value if no interpolation pattern", async () => {
    const result = await resolveInterpolation("plain-key-value");
    expect(result).toBe("plain-key-value");
  });

  it("should return undefined for empty string", async () => {
    const result = await resolveInterpolation("");
    expect(result).toBeUndefined();
  });

  it("should return undefined for whitespace-only string", async () => {
    const result = await resolveInterpolation("   ");
    expect(result).toBeUndefined();
  });

  it("should trim surrounding whitespace", async () => {
    const result = await resolveInterpolation("  some-value  ");
    expect(result).toBe("some-value");
  });
});
