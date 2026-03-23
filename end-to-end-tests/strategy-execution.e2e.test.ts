/**
 * E2E Test: Strategy Execution
 *
 * Tests the strategy loader and exporter — loading a declarative
 * JSON/YAML strategy definition, instantiating it into a runnable
 * agent/flow tree, executing it, and exporting back to serialized form.
 *
 * Covers:
 *   1. Strategy with tool-calling agent (JSON)
 *   2. Strategy with nested flows (YAML)
 *   3. Strategy with defaults + useDefaults overrides
 *   4. Strategy with user agent (preset message)
 *   5. Strategy with custom tools
 *   6. Strategy hook injection (agentHooks + flowHooks)
 *   7. Strategy round-trip (load → export → reload → execute)
 *
 * All tests use mock providers — no API keys required.
 */

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { defineTool, exportStrategy, loadStrategyFromString } from "@comma-agents/core";
import type { AgentHooks, FlowHooks, ProviderFactory } from "@comma-agents/core";
import { createSimpleMockModel, createToolCallingMockModel } from "./helpers/mock-model";

// Helpers

/**
 * Create a mock provider factory that returns a mock model.
 * The model returns responses in order from the `responses` map.
 * Key format: "modelId" → responses for agents using that model.
 */
function createMockProviders(
  modelResponses: Record<string, string[]>,
): Record<string, ProviderFactory> {
  return {
    mock: (modelId: string) => {
      const responses = modelResponses[modelId];
      if (!responses) {
        throw new Error(`No mock responses for model: ${modelId}`);
      }
      return createSimpleMockModel(responses);
    },
  };
}

/**
 * Create mock providers where one model does tool calls.
 */
function createToolCallingProviders(
  modelId: string,
  rounds: Parameters<typeof createToolCallingMockModel>[0]["rounds"],
): Record<string, ProviderFactory> {
  const model = createToolCallingMockModel({ rounds });
  return {
    mock: (id: string) => {
      if (id === modelId) return model;
      return createSimpleMockModel(["fallback response"]);
    },
  };
}

// Tests

describe("E2E: Strategy Execution", () => {
  // -----------------------------------------------------------------------
  // 1. Strategy with tool-calling agent (JSON)
  // -----------------------------------------------------------------------

  describe("strategy with tool-calling agent", () => {
    it("should load and execute a strategy with a custom tool", async () => {
      const strategyJson = JSON.stringify({
        name: "tool-strategy",
        version: "1.0",
        agents: {
          worker: {
            model: "mock/tool-model",
            tools: ["my-tool"],
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "worker" }],
        },
      });

      // Custom tool
      const myTool = defineTool({
        description: "A test tool",
        parameters: z.object({ value: z.string() }),
        execute: async (args) => ({ output: `processed: ${args.value}` }),
      });

      const providers = createToolCallingProviders("tool-model", [
        {
          toolCalls: [{ id: "c1", name: "my-tool", args: { value: "hello" } }],
        },
        { text: "Tool returned: processed: hello" },
      ]);

      const loaded = loadStrategyFromString(strategyJson, "json", {
        providers,
        customTools: { "my-tool": myTool },
      });

      expect(loaded.name).toBe("tool-strategy");
      expect(loaded.version).toBe("1.0");
      expect(loaded.agents.worker).toBeDefined();

      const result = await loaded.flow.call("Use the tool");
      expect(result.text).toBe("Tool returned: processed: hello");
    });
  });

  // -----------------------------------------------------------------------
  // 2. Strategy with nested flows (YAML)
  // -----------------------------------------------------------------------

  describe("strategy with nested flows", () => {
    it("should load YAML strategy with nested sequential + broadcast flows", () => {
      const yaml = `
name: nested-flows
version: "1.0"
agents:
  analyzer:
    model: mock/analyzer
  reviewer1:
    model: mock/reviewer1
  reviewer2:
    model: mock/reviewer2
  summarizer:
    model: mock/summarizer
flow:
  type: sequential
  name: pipeline
  steps:
    - agent: analyzer
    - type: broadcast
      name: parallel-review
      steps:
        - agent: reviewer1
        - agent: reviewer2
      separator: " | "
    - agent: summarizer
`;

      const providers = createMockProviders({
        analyzer: ["Analysis complete"],
        reviewer1: ["Review 1: looks good"],
        reviewer2: ["Review 2: needs work"],
        summarizer: ["Final summary"],
      });

      const loaded = loadStrategyFromString(yaml, "yaml", { providers });

      expect(loaded.name).toBe("nested-flows");
      expect(Object.keys(loaded.agents)).toEqual([
        "analyzer",
        "reviewer1",
        "reviewer2",
        "summarizer",
      ]);
    });

    it("should execute a YAML strategy with nested flows end-to-end", async () => {
      const yaml = `
name: nested-exec
version: "1.0"
agents:
  writer:
    model: mock/writer
  editor:
    model: mock/editor
flow:
  type: sequential
  name: write-edit
  steps:
    - agent: writer
    - agent: editor
`;

      const providers = createMockProviders({
        writer: ["Draft of the article"],
        editor: ["Polished final article"],
      });

      const loaded = loadStrategyFromString(yaml, "yaml", { providers });
      const result = await loaded.flow.call("Write an article");

      expect(result.text).toBe("Polished final article");
    });

    it("should load strategy with cycle flow and observer", async () => {
      const json = JSON.stringify({
        name: "cycle-strategy",
        version: "1.0",
        agents: {
          writer: { model: "mock/writer" },
          critic: { model: "mock/critic" },
        },
        flow: {
          type: "cycle",
          name: "refine-loop",
          steps: [{ agent: "writer" }],
          cycles: 2,
          observer: "critic",
        },
      });

      const providers = createMockProviders({
        writer: ["Draft v1", "Draft v2"],
        critic: ["Feedback v1", "Feedback v2"],
      });

      const loaded = loadStrategyFromString(json, "json", { providers });
      const result = await loaded.flow.call("Write something");

      // After 2 cycles with an observer, result should be defined
      expect(result.text).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Strategy with defaults + useDefaults overrides
  // -----------------------------------------------------------------------

  describe("defaults and overrides", () => {
    it("should apply defaults to agents with useDefaults: true", async () => {
      const json = JSON.stringify({
        name: "defaults-strategy",
        version: "1.0",
        defaults: {
          model: "mock/default-model",
          systemPrompt: "You are a helpful assistant.",
        },
        agents: {
          agent1: {
            useDefaults: true,
            // Inherits model and systemPrompt from defaults
          },
          agent2: {
            model: "mock/custom-model",
            // Explicitly sets model, ignores defaults (useDefaults not set)
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }, { agent: "agent2" }],
        },
      });

      const providers = createMockProviders({
        "default-model": ["Default model response"],
        "custom-model": ["Custom model response"],
      });

      const loaded = loadStrategyFromString(json, "json", { providers });

      expect(loaded.agents.agent1).toBeDefined();
      expect(loaded.agents.agent2).toBeDefined();

      const result = await loaded.flow.call("Hello");
      expect(result.text).toBe("Custom model response");
    });

    it("should let agent-level fields override defaults", async () => {
      const json = JSON.stringify({
        name: "override-test",
        version: "1.0",
        defaults: {
          model: "mock/default",
          systemPrompt: "Default prompt",
        },
        agents: {
          agent1: {
            useDefaults: true,
            systemPrompt: "Overridden prompt",
            // model comes from defaults
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      const providers = createMockProviders({
        default: ["Response with overridden prompt"],
      });

      const loaded = loadStrategyFromString(json, "json", { providers });
      const result = await loaded.flow.call("Test");

      expect(result.text).toBe("Response with overridden prompt");
    });

    it("should fail if agent has no model and useDefaults is false", () => {
      const json = JSON.stringify({
        name: "no-model",
        version: "1.0",
        agents: {
          agent1: {
            // No model, no useDefaults
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      const providers = createMockProviders({});

      expect(() => {
        loadStrategyFromString(json, "json", { providers });
      }).toThrow(/model/i);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Strategy with user agent (preset message)
  // -----------------------------------------------------------------------

  describe("user agent", () => {
    it("should create a user agent with preset message", async () => {
      const json = JSON.stringify({
        name: "user-agent-strategy",
        version: "1.0",
        agents: {
          user: {
            type: "user",
            config: {
              requireInput: false,
              presetMessage: "I approve this review.",
            },
          },
          worker: {
            model: "mock/worker",
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "worker" }, { agent: "user" }],
        },
      });

      const providers = createMockProviders({
        worker: ["Here is my analysis."],
      });

      const loaded = loadStrategyFromString(json, "json", { providers });

      expect(loaded.agents.user).toBeDefined();
      expect(loaded.agents.user!.name).toBe("user");

      // The user agent with preset message should return the preset
      const result = await loaded.flow.call("Start review");
      expect(result.text).toBe("I approve this review.");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Strategy with custom tools
  // -----------------------------------------------------------------------

  describe("custom tools", () => {
    it("should resolve custom tools by name", async () => {
      const calculator = defineTool({
        description: "Add two numbers",
        parameters: z.object({
          a: z.number(),
          b: z.number(),
        }),
        execute: async (args) => ({
          output: `${args.a + args.b}`,
        }),
      });

      const json = JSON.stringify({
        name: "custom-tools",
        version: "1.0",
        agents: {
          math: {
            model: "mock/math-model",
            tools: ["calculator"],
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "math" }],
        },
      });

      const providers = createToolCallingProviders("math-model", [
        {
          toolCalls: [{ id: "c1", name: "calculator", args: { a: 3, b: 4 } }],
        },
        { text: "3 + 4 = 7" },
      ]);

      const loaded = loadStrategyFromString(json, "json", {
        providers,
        customTools: { calculator },
      });

      const result = await loaded.flow.call("What is 3 + 4?");
      expect(result.text).toBe("3 + 4 = 7");
    });

    it("should fail when referencing an unknown tool", () => {
      const json = JSON.stringify({
        name: "unknown-tool",
        version: "1.0",
        agents: {
          agent1: {
            model: "mock/model",
            tools: ["nonexistent-tool"],
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      const providers = createMockProviders({ model: ["Response"] });

      expect(() => {
        loadStrategyFromString(json, "json", { providers });
      }).toThrow(/nonexistent-tool/);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Strategy hook injection
  // -----------------------------------------------------------------------

  describe("hook injection", () => {
    it("should inject agentHooks into all LLM agents", async () => {
      const hookLog: string[] = [];

      const agentHooks: AgentHooks = {
        beforeCall: [
          async () => {
            hookLog.push("beforeCall");
          },
        ],
        afterCall: [
          async () => {
            hookLog.push("afterCall");
          },
        ],
      };

      const json = JSON.stringify({
        name: "hook-strategy",
        version: "1.0",
        agents: {
          agent1: { model: "mock/model" },
          agent2: { model: "mock/model" },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }, { agent: "agent2" }],
        },
      });

      const providers = createMockProviders({
        model: ["Response 1", "Response 2"],
      });

      const loaded = loadStrategyFromString(json, "json", {
        providers,
        agentHooks,
      });

      await loaded.flow.call("Test hooks");

      // Both agents should have received the hooks
      expect(hookLog.filter((h) => h === "beforeCall").length).toBe(2);
      expect(hookLog.filter((h) => h === "afterCall").length).toBe(2);
    });

    it("should inject flowHooks into all flows", async () => {
      const hookLog: string[] = [];

      const flowHooks: FlowHooks = {
        beforeFlow: [
          async () => {
            hookLog.push("beforeFlow");
          },
        ],
        afterFlow: [
          async () => {
            hookLog.push("afterFlow");
          },
        ],
        beforeStep: [
          async ({ stepName }) => {
            hookLog.push(`beforeStep:${stepName}`);
          },
        ],
      };

      const json = JSON.stringify({
        name: "flow-hook-strategy",
        version: "1.0",
        agents: {
          agent1: { model: "mock/model" },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      const providers = createMockProviders({
        model: ["Response"],
      });

      const loaded = loadStrategyFromString(json, "json", {
        providers,
        flowHooks,
      });

      await loaded.flow.call("Test flow hooks");

      expect(hookLog).toContain("beforeFlow");
      expect(hookLog).toContain("afterFlow");
      expect(hookLog).toContain("beforeStep:agent1");
    });
  });

  // -----------------------------------------------------------------------
  // 7. Strategy round-trip (load → export → reload → execute)
  // -----------------------------------------------------------------------

  describe("round-trip serialization", () => {
    it("should round-trip JSON: load → export → reload → get same result", async () => {
      const originalJson = JSON.stringify({
        name: "round-trip",
        version: "2.0",
        description: "A round-trip test strategy",
        defaults: {
          model: "mock/default",
        },
        agents: {
          writer: {
            useDefaults: true,
            systemPrompt: "You are a writer.",
          },
          editor: {
            model: "mock/editor",
          },
        },
        flow: {
          type: "sequential",
          name: "pipeline",
          steps: [{ agent: "writer" }, { agent: "editor" }],
        },
      });

      // Create providers that always return fresh mocks
      const makeProviders = () =>
        createMockProviders({
          default: ["Writer output"],
          editor: ["Editor output"],
        });

      // First load
      const loaded1 = loadStrategyFromString(originalJson, "json", {
        providers: makeProviders(),
      });

      // Export to JSON
      const exported = exportStrategy(loaded1, { format: "json" });

      // Reload from exported
      const loaded2 = loadStrategyFromString(exported, "json", {
        providers: makeProviders(),
      });

      // Verify metadata matches
      expect(loaded2.name).toBe(loaded1.name);
      expect(loaded2.version).toBe(loaded1.version);
      expect(loaded2.description).toBe(loaded1.description);

      // Execute both and compare
      const result1 = await loaded1.flow.call("Test");
      const result2 = await loaded2.flow.call("Test");
      expect(result1.text).toBe(result2.text);
    });

    it("should round-trip YAML: load → export as YAML → reload", async () => {
      const originalYaml = `
name: yaml-round-trip
version: "1.0"
agents:
  agent1:
    model: mock/model
    systemPrompt: "Hello world"
flow:
  type: sequential
  name: main
  steps:
    - agent: agent1
`;

      const makeProviders = () =>
        createMockProviders({
          model: ["YAML response"],
        });

      const loaded1 = loadStrategyFromString(originalYaml, "yaml", {
        providers: makeProviders(),
      });

      const exportedYaml = exportStrategy(loaded1, { format: "yaml" });

      const loaded2 = loadStrategyFromString(exportedYaml, "yaml", {
        providers: makeProviders(),
      });

      expect(loaded2.name).toBe("yaml-round-trip");
      expect(loaded2.version).toBe("1.0");

      const result = await loaded2.flow.call("Test");
      expect(result.text).toBe("YAML response");
    });

    it("should round-trip JSON to YAML and back", async () => {
      const originalJson = JSON.stringify({
        name: "cross-format",
        version: "1.0",
        agents: {
          agent1: { model: "mock/model" },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      const makeProviders = () => createMockProviders({ model: ["Cross-format response"] });

      // Load from JSON
      const loaded1 = loadStrategyFromString(originalJson, "json", {
        providers: makeProviders(),
      });

      // Export as YAML
      const yaml = exportStrategy(loaded1, { format: "yaml" });

      // Reload from YAML
      const loaded2 = loadStrategyFromString(yaml, "yaml", {
        providers: makeProviders(),
      });

      // Export back to JSON
      const json2 = exportStrategy(loaded2, { format: "json" });

      // Reload from JSON again
      const loaded3 = loadStrategyFromString(json2, "json", {
        providers: makeProviders(),
      });

      expect(loaded3.name).toBe("cross-format");

      const result = await loaded3.flow.call("Test");
      expect(result.text).toBe("Cross-format response");
    });
  });

  // -----------------------------------------------------------------------
  // Validation errors
  // -----------------------------------------------------------------------

  describe("validation errors", () => {
    it("should reject invalid JSON", () => {
      const providers = createMockProviders({});
      expect(() => {
        loadStrategyFromString("not valid json", "json", { providers });
      }).toThrow(/parse/i);
    });

    it("should reject strategy missing required fields", () => {
      const json = JSON.stringify({
        // Missing name, version, agents, flow
      });
      const providers = createMockProviders({});
      expect(() => {
        loadStrategyFromString(json, "json", { providers });
      }).toThrow(/validation/i);
    });

    it("should reject agent referencing unknown provider", () => {
      const json = JSON.stringify({
        name: "bad-provider",
        version: "1.0",
        agents: {
          agent1: { model: "unknown-provider/model" },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      const providers = createMockProviders({});
      expect(() => {
        loadStrategyFromString(json, "json", { providers });
      }).toThrow(/unknown-provider/i);
    });

    it("should reject flow referencing undefined agent", () => {
      const json = JSON.stringify({
        name: "bad-ref",
        version: "1.0",
        agents: {
          agent1: { model: "mock/model" },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "nonexistent" }],
        },
      });

      const providers = createMockProviders({ model: ["Response"] });
      expect(() => {
        loadStrategyFromString(json, "json", { providers });
      }).toThrow(/nonexistent/);
    });
  });
});
