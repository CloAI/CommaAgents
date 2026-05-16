import { describe, expect, it } from "bun:test";
import { ModelResolutionError } from "../../errors/index";
import {
  getProviderPackage,
  isKnownProvider,
  parseModel,
} from "../../model/model.utils";

describe("parseModel", () => {
  it("should parse a simple provider/model string", () => {
    const result = parseModel("openai/gpt-4o");
    expect(result.providerId).toBe("openai");
    expect(result.modelId).toBe("gpt-4o");
    expect(result.packageName).toBe("@ai-sdk/openai");
  });

  it("should parse anthropic model strings", () => {
    const result = parseModel("anthropic/claude-sonnet-4-5");
    expect(result.providerId).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-5");
    expect(result.packageName).toBe("@ai-sdk/anthropic");
  });

  it("should handle model IDs with slashes (only first slash is separator)", () => {
    const result = parseModel("ollama/meta-llama/llama-3");
    expect(result.providerId).toBe("ollama");
    expect(result.modelId).toBe("meta-llama/llama-3");
    expect(result.packageName).toBe("ollama-ai-provider");
  });

  it("should return undefined packageName for unknown providers", () => {
    const result = parseModel("custom-provider/some-model");
    expect(result.providerId).toBe("custom-provider");
    expect(result.modelId).toBe("some-model");
    expect(result.packageName).toBeUndefined();
  });

  it("should trim whitespace", () => {
    const result = parseModel("  openai/gpt-4o  ");
    expect(result.providerId).toBe("openai");
    expect(result.modelId).toBe("gpt-4o");
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

describe("isKnownProvider", () => {
  it("should return true for catalog providers", () => {
    expect(isKnownProvider("openai")).toBe(true);
    expect(isKnownProvider("anthropic")).toBe(true);
    expect(isKnownProvider("google")).toBe(true);
  });

  it("should return true for built-in override providers", () => {
    expect(isKnownProvider("ollama")).toBe(true);
    expect(isKnownProvider("deepseek")).toBe(true);
  });

  it("should return false for unknown providers", () => {
    expect(isKnownProvider("custom")).toBe(false);
    expect(isKnownProvider("")).toBe(false);
  });
});

describe("getProviderPackage", () => {
  it("should return package name for catalog providers", () => {
    expect(getProviderPackage("openai")).toBe("@ai-sdk/openai");
    expect(getProviderPackage("anthropic")).toBe("@ai-sdk/anthropic");
  });

  it("should return overridden package name for deepseek", () => {
    // Catalog lists deepseek as @ai-sdk/openai-compatible; our built-in
    // override prefers the dedicated @ai-sdk/deepseek package.
    expect(getProviderPackage("deepseek")).toBe("@ai-sdk/deepseek");
  });

  it("should return ollama-ai-provider for ollama (not in catalog)", () => {
    expect(getProviderPackage("ollama")).toBe("ollama-ai-provider");
  });

  it("should return undefined for unknown providers", () => {
    expect(getProviderPackage("custom")).toBeUndefined();
  });
});
