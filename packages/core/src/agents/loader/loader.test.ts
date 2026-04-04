// Tests for agent loader — parse, validate, and instantiate agents.

import { afterEach, describe, expect, it } from "bun:test";
import { StrategyValidationError } from "../../errors/index";
import { registerModel, resetModelRegistry } from "../../model/model";
import { registerTool, resetToolRegistry } from "../../tools/tool.registry";
import type { ToolDefinition } from "../../tools/tool.types";
import { loadAgent, loadAgentFromString } from "./loader";
import { AgentDescriptionSchema } from "./loader.schema";
import type { LoadAgentOptions } from "./loader.types";

// Mock model registration

/** Create and register a mock model for a given model string. */
function registerMockModel(modelString: string): void {
  registerModel(modelString, {
    modelId: modelString,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: `response from ${modelString}` }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: undefined, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock doesn't need full LanguageModel interface
  } as any);
}

/** Register standard mock models used across tests. */
function setupMockModels(): void {
  registerMockModel("openai/gpt-4o");
  registerMockModel("anthropic/claude-sonnet-4-20250514");
}

// Cleanup

afterEach(() => {
  resetModelRegistry();
  resetToolRegistry();
});

// Minimal description strings

const MINIMAL_JSON = JSON.stringify({
  name: "researcher",
  model: "openai/gpt-4o",
});

const MINIMAL_YAML = `
name: researcher
model: openai/gpt-4o
`;

const FULL_JSON = JSON.stringify({
  name: "writer",
  description: "A creative writing assistant",
  model: "anthropic/claude-sonnet-4-20250514",
  systemPrompt: "You are a creative writer.",
  tools: ["read", "grep"],
});

const TEMPLATE_YAML = `
name: coder
model: openai/gpt-4o
systemPromptTemplate:
  template: "You are a {{ role }} who writes {{ language }} code."
  variables:
    role: senior engineer
    language: TypeScript
`;

// -- Schema tests --

describe("AgentDescriptionSchema", () => {
  it("should accept a minimal description with only name and model", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "researcher",
      model: "openai/gpt-4o",
    });
    expect(result.success).toBe(true);
  });

  it("should accept a full description with all fields", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "writer",
      description: "A creative writer",
      model: "anthropic/claude-sonnet-4-20250514",
      systemPrompt: "Write creatively.",
      tools: ["read", "grep"],
    });
    expect(result.success).toBe(true);
  });

  it("should accept systemPromptTemplate with variables", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "coder",
      model: "openai/gpt-4o",
      systemPromptTemplate: {
        template: "You are a {{ role }}.",
        variables: { role: "developer" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("should accept systemPromptTemplate without variables", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "coder",
      model: "openai/gpt-4o",
      systemPromptTemplate: {
        template: "You are a coder.",
      },
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "",
      model: "openai/gpt-4o",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty model", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "test",
      model: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing name", () => {
    const result = AgentDescriptionSchema.safeParse({
      model: "openai/gpt-4o",
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing model", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "test",
    });
    expect(result.success).toBe(false);
  });

  it("should reject temperature (removed field)", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "test",
      model: "openai/gpt-4o",
      temperature: 0.5,
    });
    expect(result.success).toBe(false);
  });

  it("should reject topProbability (removed field)", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "test",
      model: "openai/gpt-4o",
      topProbability: 0.9,
    });
    expect(result.success).toBe(false);
  });

  it("should reject stream (removed field)", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "test",
      model: "openai/gpt-4o",
      stream: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject maxSteps (removed field)", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "test",
      model: "openai/gpt-4o",
      maxSteps: 3,
    });
    expect(result.success).toBe(false);
  });

  it("should reject unknown fields (strict mode)", () => {
    const result = AgentDescriptionSchema.safeParse({
      name: "test",
      model: "openai/gpt-4o",
      unknownField: true,
    });
    expect(result.success).toBe(false);
  });
});

// -- loadAgentFromString tests --

describe("loadAgentFromString", () => {
  describe("parsing", () => {
    it("should parse a minimal JSON description", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      expect(agent.name).toBe("researcher");
    });

    it("should parse a minimal YAML description", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_YAML, "yaml");
      expect(agent.name).toBe("researcher");
    });

    it("should parse a full JSON description with all fields", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(FULL_JSON, "json");
      expect(agent.name).toBe("writer");
    });

    it("should throw on invalid JSON", async () => {
      await expect(loadAgentFromString("not json{}", "json")).rejects.toThrow(
        StrategyValidationError,
      );
    });

    it("should throw on invalid YAML", async () => {
      await expect(loadAgentFromString(":\n  - :\n    :", "yaml")).rejects.toThrow(
        StrategyValidationError,
      );
    });
  });

  describe("validation", () => {
    it("should throw on missing name", async () => {
      const json = JSON.stringify({ model: "openai/gpt-4o" });
      await expect(loadAgentFromString(json, "json")).rejects.toThrow(StrategyValidationError);
    });

    it("should throw on missing model", async () => {
      const json = JSON.stringify({ name: "test" });
      await expect(loadAgentFromString(json, "json")).rejects.toThrow(StrategyValidationError);
    });

    it("should throw on unknown fields", async () => {
      const json = JSON.stringify({
        name: "test",
        model: "openai/gpt-4o",
        useDefaults: true,
      });
      await expect(loadAgentFromString(json, "json")).rejects.toThrow(StrategyValidationError);
    });

    it("should include validation issue details in error message", async () => {
      const json = JSON.stringify({ model: "openai/gpt-4o" });
      try {
        await loadAgentFromString(json, "json");
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(StrategyValidationError);
        expect((error as StrategyValidationError).message).toContain("validation failed");
        expect((error as StrategyValidationError).message).toContain("name");
      }
    });
  });

  describe("model resolution", () => {
    it("should store model string in agent config", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      expect(agent.config?.model).toBe("openai/gpt-4o");
    });

    it("should resolve model via model registry at call time", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      // The agent should be callable — model resolution happens in buildCallOptions
      const result = await agent.call("hello");
      expect(result.text).toContain("response from openai/gpt-4o");
    });

    it("should throw at call time when model is not registered", async () => {
      const json = JSON.stringify({ name: "test", model: "unknown-provider/model" });
      const agent = await loadAgentFromString(json, "json");
      // Model resolution happens at call time, not creation time
      await expect(agent.call("hello")).rejects.toThrow();
    });
  });

  describe("tool resolution", () => {
    it("should store tool names in agent config", async () => {
      setupMockModels();
      const json = JSON.stringify({
        name: "test",
        model: "openai/gpt-4o",
        tools: ["read"],
      });
      const agent = await loadAgentFromString(json, "json");
      expect(agent.config?.tools).toEqual(["read"]);
    });

    it("should resolve custom tools by name via the tool registry", async () => {
      setupMockModels();
      const customTool: ToolDefinition = {
        description: "A custom tool",
        parameters: { type: "object", properties: {} } as unknown as ToolDefinition["parameters"],
        execute: async () => ({ output: "done" }),
      };
      registerTool("my-tool", customTool);

      const json = JSON.stringify({
        name: "test",
        model: "openai/gpt-4o",
        tools: ["my-tool"],
      });
      const agent = await loadAgentFromString(json, "json");
      expect(agent.config?.tools).toEqual(["my-tool"]);
    });

    it("should not set tools when tools array is not provided", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      expect(agent.config?.tools).toBeUndefined();
    });
  });

  describe("system prompt", () => {
    it("should pass through a static system prompt", async () => {
      setupMockModels();
      const json = JSON.stringify({
        name: "test",
        model: "openai/gpt-4o",
        systemPrompt: "You are helpful.",
      });
      const agent = await loadAgentFromString(json, "json");
      expect(agent.config?.systemPrompt).toBe("You are helpful.");
    });

    it("should build a prompt template from systemPromptTemplate and store in systemPrompt", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(TEMPLATE_YAML, "yaml");
      // Loader converts systemPromptTemplate to a PromptTemplate stored in the unified systemPrompt field
      expect(agent.config?.systemPrompt).toBeDefined();
      expect(typeof agent.config!.systemPrompt).not.toBe("string");
      const rendered = await (
        agent.config!.systemPrompt as { render: () => Promise<string> }
      ).render();
      expect(rendered).toBe("You are a senior engineer who writes TypeScript code.");
    });

    it("should prefer systemPromptTemplate over static systemPrompt when both present", async () => {
      setupMockModels();
      const json = JSON.stringify({
        name: "test",
        model: "openai/gpt-4o",
        systemPrompt: "Static prompt",
        systemPromptTemplate: {
          template: "Dynamic {{ type }} prompt",
          variables: { type: "template" },
        },
      });
      const agent = await loadAgentFromString(json, "json");
      // When template is present, systemPrompt should be the PromptTemplate (not the static string)
      expect(typeof agent.config!.systemPrompt).not.toBe("string");
      const rendered = await (
        agent.config!.systemPrompt as { render: () => Promise<string> }
      ).render();
      expect(rendered).toBe("Dynamic template prompt");
    });

    it("should leave systemPrompt undefined when not provided", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      expect(agent.config?.systemPrompt).toBeUndefined();
    });
  });

  describe("agent lifecycle", () => {
    it("should return an agent with call, reset, stream methods", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      expect(typeof agent.call).toBe("function");
      expect(typeof agent.reset).toBe("function");
      expect(typeof agent.stream).toBe("function");
    });

    it("should return an agent with getHistory and getTurns", async () => {
      setupMockModels();
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      expect(typeof agent.getHistory).toBe("function");
      expect(typeof agent.getTurns).toBe("function");
    });
  });

  describe("global defaults fallback", () => {
    it("should fall back to global defaults when no options provided", async () => {
      // Without a registered model, resolution will fail at call time.
      // The agent is created successfully (model is just a string).
      const agent = await loadAgentFromString(MINIMAL_JSON, "json");
      expect(agent.name).toBe("researcher");
      expect(agent.config?.model).toBe("openai/gpt-4o");
    });

    it("should fall back to global defaults when empty options provided", async () => {
      // Same — agent is created, model resolution deferred to call time
      const agent = await loadAgentFromString(MINIMAL_JSON, "json", {});
      expect(agent.name).toBe("researcher");
      expect(agent.config?.model).toBe("openai/gpt-4o");
    });
  });
});

// -- loadAgent file-based tests --

describe("loadAgent", () => {
  it("should throw on unsupported file extension", async () => {
    await expect(loadAgent("test.txt")).rejects.toThrow(StrategyValidationError);
  });

  it("should throw on missing file", async () => {
    await expect(loadAgent("nonexistent.yaml")).rejects.toThrow(StrategyValidationError);
  });

  it("should include file extension in error message for unsupported types", async () => {
    try {
      await loadAgent("test.xml");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StrategyValidationError);
      expect((error as StrategyValidationError).message).toContain(".xml");
    }
  });

  it("should include file path in error message for missing files", async () => {
    try {
      await loadAgent("missing-agent.yaml");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StrategyValidationError);
      expect((error as StrategyValidationError).message).toContain("missing-agent.yaml");
    }
  });
});
