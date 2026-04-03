// Tests for loader utilities — parseModel, KNOWN_PROVIDERS, isKnownProvider, getProviderPackage.

import { describe, expect, it } from "bun:test";
import { ModelResolutionError } from "../../errors/index";
import { getProviderPackage, isKnownProvider, KNOWN_PROVIDERS, parseModel } from "./loader.utils";

// parseModel

describe("parseModel", () => {
  it("should parse a simple provider/model string", () => {
    const result = parseModel("openai/gpt-4o");
    expect(result.providerID).toBe("openai");
    expect(result.modelID).toBe("gpt-4o");
    expect(result.packageName).toBe("@ai-sdk/openai");
  });

  it("should parse anthropic model strings", () => {
    const result = parseModel("anthropic/claude-sonnet-4-5");
    expect(result.providerID).toBe("anthropic");
    expect(result.modelID).toBe("claude-sonnet-4-5");
    expect(result.packageName).toBe("@ai-sdk/anthropic");
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
