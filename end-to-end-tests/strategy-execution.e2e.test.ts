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
 *   3. Validation of strategies with defaults/useDefaults (rejected by schema)
 *   4. Strategy with user agent (preset message)
 *   5. Strategy with custom tools (registered via registerTool)
 *   6. Strategy hook injection (agentHooks + flowHooks)
 *   7. Strategy round-trip (load → export → reload → execute)
 *
 * All tests use mock models registered via registerModel() — no API keys required.
 */

import { afterEach, describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  defineTool,
  exportStrategy,
  hookIntoAgent,
  loadStrategyFromString,
  registerModel,
  registerTool,
  resetGlobalDefaults,
  resetModelRegistry,
  resetToolRegistry,
} from "@comma-agents/core";
import type { AgentHooks, FlowHooks } from "@comma-agents/core";
import { createSimpleMockModel, createToolCallingMockModel } from "./helpers/mock-model";

// Cleanup — reset global registries after each test

afterEach(() => {
  resetModelRegistry();
  resetGlobalDefaults();
  resetToolRegistry();
});

// Helpers

/**
 * Register mock models for a set of model strings.
 * Each model returns predetermined text responses in order.
 *
 * Model strings should be full "provider/model" format (e.g., "mock/analyzer").
 */
function registerMockModels(modelResponses: Record<string, string[]>): void {
  for (const [modelString, responses] of Object.entries(modelResponses)) {
    const fullModelString = modelString.includes("/") ? modelString : `mock/${modelString}`;
    registerModel(fullModelString, createSimpleMockModel(responses));
  }
}

/**
 * Register a tool-calling mock model for a given model string.
 */
function registerToolCallingModel(
  modelString: string,
  rounds: Parameters<typeof createToolCallingMockModel>[0]["rounds"],
): void {
  const fullModelString = modelString.includes("/") ? modelString : `mock/${modelString}`;
  registerModel(fullModelString, createToolCallingMockModel({ rounds }));
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

      // Custom tool — registered globally
      const myTool = defineTool({
        description: "A test tool",
        parameters: z.object({ value: z.string() }),
        execute: async (args) => ({ output: `processed: ${args.value}` }),
      });
      registerTool("my-tool", myTool);

      // Register tool-calling mock model
      registerToolCallingModel("mock/tool-model", [
        {
          toolCalls: [{ id: "c1", name: "my-tool", args: { value: "hello" } }],
        },
        { text: "Tool returned: processed: hello" },
      ]);

      const loaded = await loadStrategyFromString(strategyJson, "json");

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
    it("should load YAML strategy with nested sequential + broadcast flows", async () => {
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

      registerMockModels({
        "mock/analyzer": ["Analysis complete"],
        "mock/reviewer1": ["Review 1: looks good"],
        "mock/reviewer2": ["Review 2: needs work"],
        "mock/summarizer": ["Final summary"],
      });

      const loaded = await loadStrategyFromString(yaml, "yaml");

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

      registerMockModels({
        "mock/writer": ["Draft of the article"],
        "mock/editor": ["Polished final article"],
      });

      const loaded = await loadStrategyFromString(yaml, "yaml");
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

      registerMockModels({
        "mock/writer": ["Draft v1", "Draft v2"],
        "mock/critic": ["Feedback v1", "Feedback v2"],
      });

      const loaded = await loadStrategyFromString(json, "json");
      const result = await loaded.flow.call("Write something");

      // After 2 cycles with an observer, result should be defined
      expect(result.text).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Strategies with defaults/useDefaults are rejected by schema
  // -----------------------------------------------------------------------

  describe("defaults and useDefaults", () => {
    it("should reject strategy with defaults field", async () => {
      const json = JSON.stringify({
        name: "defaults-strategy",
        version: "1.0",
        defaults: {
          model: "mock/default-model",
          systemPrompt: "You are a helpful assistant.",
        },
        agents: {
          agent1: { model: "mock/model" },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      await expect(loadStrategyFromString(json, "json")).rejects.toThrow(/validation/i);
    });

    it("should reject strategy with useDefaults on an agent", async () => {
      const json = JSON.stringify({
        name: "usedefaults-strategy",
        version: "1.0",
        agents: {
          agent1: {
            useDefaults: true,
            model: "mock/model",
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      await expect(loadStrategyFromString(json, "json")).rejects.toThrow(/validation/i);
    });

    it("should fail if agent has no model", async () => {
      const json = JSON.stringify({
        name: "no-model",
        version: "1.0",
        agents: {
          agent1: {
            // No model
          },
        },
        flow: {
          type: "sequential",
          name: "main",
          steps: [{ agent: "agent1" }],
        },
      });

      await expect(loadStrategyFromString(json, "json")).rejects.toThrow(/model/i);
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

      registerMockModels({ "mock/worker": ["Here is my analysis."] });

      const loaded = await loadStrategyFromString(json, "json");

      expect(loaded.agents.user).toBeDefined();
      expect(loaded.agents.user!.name).toBe("user");

      // The user agent with preset message should return the preset
      const result = await loaded.flow.call("Start review");
      expect(result.text).toBe("I approve this review.");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Strategy with custom tools (registered via registerTool)
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
      registerTool("calculator", calculator);

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

      registerToolCallingModel("mock/math-model", [
        {
          toolCalls: [{ id: "c1", name: "calculator", args: { a: 3, b: 4 } }],
        },
        { text: "3 + 4 = 7" },
      ]);

      const loaded = await loadStrategyFromString(json, "json");

      const result = await loaded.flow.call("What is 3 + 4?");
      expect(result.text).toBe("3 + 4 = 7");
    });

    it("should fail when referencing an unknown tool", async () => {
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

      registerMockModels({ "mock/model": ["Response"] });

      // Tool resolution now happens at call time, so loading succeeds
      const loaded = await loadStrategyFromString(json, "json");

      // Calling the flow fails because the tool can't be resolved
      await expect(loaded.flow.call("Test")).rejects.toThrow(/nonexistent-tool/);
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
        afterCallResult: [
          async () => {
            hookLog.push("afterCallResult");
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

      registerMockModels({ "mock/model": ["Response 1", "Response 2"] });

      const loaded = await loadStrategyFromString(json, "json");

      // Inject hooks post-load into all agents that support appendHook
      for (const agent of Object.values(loaded.agents)) {
        if ("appendHook" in agent) {
          hookIntoAgent(agent, agentHooks);
        }
      }

      await loaded.flow.call("Test hooks");

      // Both agents should have received the hooks
      expect(hookLog.filter((h) => h === "beforeCall").length).toBe(2);
      expect(hookLog.filter((h) => h === "afterCallResult").length).toBe(2);
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

      registerMockModels({ "mock/model": ["Response"] });

      const loaded = await loadStrategyFromString(json, "json", {
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
        agents: {
          writer: {
            model: "mock/writer",
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

      // Register models — need fresh models for each load since
      // they consume responses in order
      const registerRoundTripModels = () => {
        resetModelRegistry();
        registerMockModels({
          "mock/writer": ["Writer output"],
          "mock/editor": ["Editor output"],
        });
      };

      // First load
      registerRoundTripModels();
      const loaded1 = await loadStrategyFromString(originalJson, "json");

      // Export to JSON
      const exported = exportStrategy(loaded1, { format: "json" });

      // Reload from exported
      registerRoundTripModels();
      const loaded2 = await loadStrategyFromString(exported, "json");

      // Verify metadata matches
      expect(loaded2.name).toBe(loaded1.name);
      expect(loaded2.version).toBe(loaded1.version);
      expect(loaded2.description).toBe(loaded1.description);

      // Execute both and compare
      registerRoundTripModels();
      const loaded1b = await loadStrategyFromString(originalJson, "json");
      const result1 = await loaded1b.flow.call("Test");

      registerRoundTripModels();
      const loaded2b = await loadStrategyFromString(exported, "json");
      const result2 = await loaded2b.flow.call("Test");

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

      const registerYamlModels = () => {
        resetModelRegistry();
        registerMockModels({ "mock/model": ["YAML response"] });
      };

      registerYamlModels();
      const loaded1 = await loadStrategyFromString(originalYaml, "yaml");

      const exportedYaml = exportStrategy(loaded1, { format: "yaml" });

      registerYamlModels();
      const loaded2 = await loadStrategyFromString(exportedYaml, "yaml");

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

      const registerCrossFormatModels = () => {
        resetModelRegistry();
        registerMockModels({ "mock/model": ["Cross-format response"] });
      };

      // Load from JSON
      registerCrossFormatModels();
      const loaded1 = await loadStrategyFromString(originalJson, "json");

      // Export as YAML
      const yaml = exportStrategy(loaded1, { format: "yaml" });

      // Reload from YAML
      registerCrossFormatModels();
      const loaded2 = await loadStrategyFromString(yaml, "yaml");

      // Export back to JSON
      const json2 = exportStrategy(loaded2, { format: "json" });

      // Reload from JSON again
      registerCrossFormatModels();
      const loaded3 = await loadStrategyFromString(json2, "json");

      expect(loaded3.name).toBe("cross-format");

      const result = await loaded3.flow.call("Test");
      expect(result.text).toBe("Cross-format response");
    });
  });

  // -----------------------------------------------------------------------
  // Validation errors
  // -----------------------------------------------------------------------

  describe("validation errors", () => {
    it("should reject invalid JSON", async () => {
      await expect(
        loadStrategyFromString("not valid json", "json"),
      ).rejects.toThrow(/parse/i);
    });

    it("should reject strategy missing required fields", async () => {
      const json = JSON.stringify({
        // Missing name, version, agents, flow
      });
      await expect(
        loadStrategyFromString(json, "json"),
      ).rejects.toThrow(/validation/i);
    });

    it("should reject agent referencing unknown provider", async () => {
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

      // Loading succeeds (model resolution is deferred to call time)
      const loaded = await loadStrategyFromString(json, "json");

      // Calling fails because no model or provider is registered
      await expect(loaded.flow.call("Test")).rejects.toThrow(/unknown-provider/i);
    });

    it("should reject flow referencing undefined agent", async () => {
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

      registerMockModels({ "mock/model": ["Response"] });

      await expect(
        loadStrategyFromString(json, "json"),
      ).rejects.toThrow(/nonexistent/);
    });
  });
});
