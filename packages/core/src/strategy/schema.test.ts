// Tests for strategy/schema.ts — Zod schema validation

import { describe, expect, it } from "bun:test";
import { BUILT_IN_TOOL_NAMES } from "../tools/tool.constants";
import {
  AgentDefSchema,
  FlowDefSchema,
  FlowStepSchema,
  isAgentStep,
  isCustomAgentDef,
  isFlowDef,
  isLLMAgentDef,
  isUserAgentDef,
  StrategySchema,
} from "./schema";

// Helpers

/** Minimal valid strategy for baseline tests. */
function minimalStrategy() {
  return {
    name: "Test",
    version: "1.0",
    agents: {
      assistant: { model: "openai/gpt-4o" },
    },
    flow: {
      name: "Main",
      type: "sequential" as const,
      steps: [{ agent: "assistant" }],
    },
  };
}

// StrategySchema — top-level

describe("StrategySchema", () => {
  it("accepts a minimal valid strategy", () => {
    const result = StrategySchema.safeParse(minimalStrategy());
    expect(result.success).toBe(true);
  });

  it("accepts a strategy with all optional fields", () => {
    const result = StrategySchema.safeParse({
      ...minimalStrategy(),
      description: "A test strategy",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a strategy with a defaults block (removed feature)", () => {
    const result = StrategySchema.safeParse({
      ...minimalStrategy(),
      defaults: {
        model: "openai/gpt-4o",
        tools: ["bash", "read"],
        systemPrompt: "Be helpful.",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = StrategySchema.safeParse({
      ...minimalStrategy(),
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty version", () => {
    const result = StrategySchema.safeParse({
      ...minimalStrategy(),
      version: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing agents", () => {
    const { agents: _, ...rest } = minimalStrategy();
    const result = StrategySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing flow", () => {
    const { flow: _, ...rest } = minimalStrategy();
    const result = StrategySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const result = StrategySchema.safeParse({
      ...minimalStrategy(),
      extraField: true,
    });
    expect(result.success).toBe(false);
  });
});

// AgentDefSchema

describe("AgentDefSchema", () => {
  describe("user agents", () => {
    it("accepts a minimal user agent", () => {
      const result = AgentDefSchema.safeParse({ type: "user" });
      expect(result.success).toBe(true);
    });

    it("accepts a user agent with config", () => {
      const result = AgentDefSchema.safeParse({
        type: "user",
        description: "Collects input",
        config: { requireInput: true, presetMessage: "Hello" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects user agent with unknown config fields", () => {
      const result = AgentDefSchema.safeParse({
        type: "user",
        config: { requireInput: true, unknown: "field" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects user agent with model field", () => {
      const result = AgentDefSchema.safeParse({
        type: "user",
        model: "openai/gpt-4o",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("LLM agents", () => {
    it("accepts a minimal LLM agent (just model)", () => {
      const result = AgentDefSchema.safeParse({ model: "openai/gpt-4o" });
      expect(result.success).toBe(true);
    });

    it("accepts an LLM agent with explicit type: llm", () => {
      const result = AgentDefSchema.safeParse({
        type: "llm",
        model: "openai/gpt-4o",
      });
      expect(result.success).toBe(true);
    });

    it("accepts an LLM agent with all optional fields", () => {
      const result = AgentDefSchema.safeParse({
        type: "llm",
        description: "A writer agent",
        model: "openai/gpt-4o",
        systemPrompt: "You write code.",
        tools: ["bash", "write"],
        skills: ["typescript", "testing"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts an LLM agent with systemPromptTemplate", () => {
      const result = AgentDefSchema.safeParse({
        model: "openai/gpt-4o",
        systemPromptTemplate: {
          template: "You are {{ role }}.",
          variables: { role: "a writer" },
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects an LLM agent with useDefaults (removed feature)", () => {
      const result = AgentDefSchema.safeParse({
        useDefaults: true,
        systemPrompt: "I use defaults.",
      });
      expect(result.success).toBe(false);
    });

    it("rejects temperature (removed field)", () => {
      const result = AgentDefSchema.safeParse({
        model: "openai/gpt-4o",
        temperature: 0.7,
      });
      expect(result.success).toBe(false);
    });

    it("rejects topProbability (removed field)", () => {
      const result = AgentDefSchema.safeParse({
        model: "openai/gpt-4o",
        topProbability: 0.9,
      });
      expect(result.success).toBe(false);
    });

    it("accepts maxSteps", () => {
      const result = AgentDefSchema.safeParse({
        model: "openai/gpt-4o",
        maxSteps: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxSteps).toBe(5);
      }
    });

    it("accepts an outputSchema JSON Schema object", () => {
      const result = AgentDefSchema.safeParse({
        model: "openai/gpt-4o",
        outputSchema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts context retention options", () => {
      const result = AgentDefSchema.safeParse({
        model: "openai/gpt-4o",
        context: {
          rollingWindow: 30,
          compaction: { keepRecent: 6 },
        },
      });

      expect(result.success).toBe(true);
    });

    it("rejects unknown fields (strict mode)", () => {
      const result = AgentDefSchema.safeParse({
        model: "openai/gpt-4o",
        unknown: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("custom agents", () => {
    it("accepts a custom agent with namespaced configuration", () => {
      const result = AgentDefSchema.safeParse({
        type: "echo",
        description: "Deterministic echo agent",
        config: { prefix: "custom: " },
      });

      expect(result.success).toBe(true);
    });

    it("rejects custom configuration outside the config object", () => {
      const result = AgentDefSchema.safeParse({
        type: "echo",
        prefix: "custom: ",
      });

      expect(result.success).toBe(false);
    });
  });
});

// FlowDefSchema — sequential, cycle, broadcast

describe("FlowDefSchema", () => {
  describe("sequential", () => {
    it("accepts a valid sequential flow", () => {
      const result = FlowDefSchema.safeParse({
        name: "Pipeline",
        type: "sequential",
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts sequential flow with description", () => {
      const result = FlowDefSchema.safeParse({
        name: "Pipeline",
        type: "sequential",
        description: "A pipeline",
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty steps array", () => {
      const result = FlowDefSchema.safeParse({
        name: "Empty",
        type: "sequential",
        steps: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("cycle", () => {
    it("accepts a basic cycle flow", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts cycle with numeric cycles", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        cycles: 5,
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts cycle with Infinity string", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        cycles: "Infinity",
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts cycle with observer", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        cycles: 3,
        observer: "critic",
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects zero cycles", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        cycles: 0,
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts custom breakCycleSignals", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        cycles: "Infinity",
        observer: "critic",
        breakCycleSignals: ["==CYCLE_DONE=="],
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty breakCycleSignals array", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        breakCycleSignals: [],
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts every breakCycleSignalMatch mode", () => {
      for (const mode of ["substring", "first-line", "any-line", "exact"]) {
        const result = FlowDefSchema.safeParse({
          name: "Loop",
          type: "cycle",
          cycles: 3,
          observer: "critic",
          breakCycleSignals: ["DONE"],
          breakCycleSignalMatch: mode,
          steps: [{ agent: "a" }],
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects an unknown breakCycleSignalMatch mode", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        breakCycleSignalMatch: "fuzzy",
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative cycles", () => {
      const result = FlowDefSchema.safeParse({
        name: "Loop",
        type: "cycle",
        cycles: -1,
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("broadcast", () => {
    it("accepts a basic broadcast flow", () => {
      const result = FlowDefSchema.safeParse({
        name: "Fan-out",
        type: "broadcast",
        steps: [{ agent: "a" }, { agent: "b" }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts broadcast with custom separator", () => {
      const result = FlowDefSchema.safeParse({
        name: "Fan-out",
        type: "broadcast",
        separator: "---",
        steps: [{ agent: "a" }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("custom flow type", () => {
    it("accepts a custom flow with namespaced configuration", () => {
      const result = FlowDefSchema.safeParse({
        name: "Pipeline",
        type: "pipeline",
        steps: [{ agent: "a" }],
        config: { stopAfter: 2 },
      });
      expect(result.success).toBe(true);
    });

    it("rejects custom configuration outside the config object", () => {
      const result = FlowDefSchema.safeParse({
        name: "Pipeline",
        type: "pipeline",
        steps: [{ agent: "a" }],
        stopAfter: 2,
      });
      expect(result.success).toBe(false);
    });
  });
});

// FlowStepSchema — recursive nesting

describe("FlowStepSchema", () => {
  it("accepts an agent reference step", () => {
    const result = FlowStepSchema.safeParse({ agent: "writer" });
    expect(result.success).toBe(true);
  });

  it("accepts an agent reference step with description", () => {
    const result = FlowStepSchema.safeParse({
      agent: "writer",
      description: "Write code",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a nested flow step", () => {
    const result = FlowStepSchema.safeParse({
      name: "Inner",
      type: "sequential",
      steps: [{ agent: "a" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts deeply nested flows", () => {
    const result = FlowStepSchema.safeParse({
      name: "Outer",
      type: "sequential",
      steps: [
        {
          name: "Middle",
          type: "cycle",
          cycles: 2,
          steps: [
            {
              name: "Inner",
              type: "broadcast",
              steps: [{ agent: "a" }, { agent: "b" }],
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

// Full strategy with nesting

describe("StrategySchema — complex strategies", () => {
  it("accepts PLAN.md Code Review Pipeline schema", () => {
    const result = StrategySchema.safeParse({
      name: "Code Review Pipeline",
      version: "1.0",
      description: "A multi-agent code review workflow",
      agents: {
        user: {
          type: "user",
          config: { requireInput: true },
        },
        writer: {
          model: "openai/gpt-4o",
          systemPrompt: "You are a code writer.",
        },
        reviewer: {
          model: "anthropic/claude-sonnet-4-5",
          systemPrompt: "You are a code reviewer.",
        },
      },
      flow: {
        name: "Review Pipeline",
        type: "sequential",
        steps: [
          { agent: "user" },
          { agent: "writer" },
          {
            name: "Review Loop",
            type: "cycle",
            cycles: 3,
            steps: [{ agent: "reviewer" }],
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects strategy with defaults and useDefaults (removed features)", () => {
    const result = StrategySchema.safeParse({
      name: "Defaults Test",
      version: "1.0",
      defaults: {
        model: "openai/gpt-4o",
        tools: ["bash", "read"],
        systemPrompt: "Be helpful.",
      },
      agents: {
        writer: {
          useDefaults: true,
          description: "Uses all defaults",
        },
        reviewer: {
          model: "anthropic/claude-sonnet-4-5",
          systemPrompt: "Review code.",
          description: "Overrides everything",
        },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "writer" }, { agent: "reviewer" }],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts strategy with broadcast + observer", () => {
    const result = StrategySchema.safeParse({
      name: "Broadcast Test",
      version: "1.0",
      agents: {
        writer: { model: "openai/gpt-4o" },
        reviewer: { model: "openai/gpt-4o" },
        critic: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Fan-out Review",
        type: "sequential",
        steps: [
          {
            name: "Parallel Review",
            type: "broadcast",
            separator: "\n---\n",
            steps: [{ agent: "reviewer" }, { agent: "critic" }],
          },
          { agent: "writer" },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});

// Type guards

describe("type guards", () => {
  describe("isUserAgentDef", () => {
    it("returns true for user agents", () => {
      expect(isUserAgentDef({ type: "user" })).toBe(true);
    });

    it("returns false for LLM agents", () => {
      expect(isUserAgentDef({ model: "openai/gpt-4o" })).toBe(false);
    });

    it("returns false for LLM agents with type: llm", () => {
      expect(isUserAgentDef({ type: "llm", model: "openai/gpt-4o" })).toBe(
        false,
      );
    });
  });

  describe("isLLMAgentDef", () => {
    it("returns true for LLM agents without type", () => {
      expect(isLLMAgentDef({ model: "openai/gpt-4o" })).toBe(true);
    });

    it("returns true for LLM agents with type: llm", () => {
      expect(isLLMAgentDef({ type: "llm", model: "openai/gpt-4o" })).toBe(true);
    });

    it("returns false for user agents", () => {
      expect(isLLMAgentDef({ type: "user" })).toBe(false);
    });
  });

  describe("isCustomAgentDef", () => {
    it("returns true for custom agents", () => {
      expect(isCustomAgentDef({ type: "echo", config: {} })).toBe(true);
    });

    it("returns false for built-in agents", () => {
      expect(isCustomAgentDef({ type: "user" })).toBe(false);
      expect(isCustomAgentDef({ model: "openai/gpt-4o" })).toBe(false);
    });
  });

  describe("isAgentStep", () => {
    it("returns true for agent reference steps", () => {
      expect(isAgentStep({ agent: "writer" })).toBe(true);
    });

    it("returns false for flow definitions", () => {
      expect(
        isAgentStep({
          name: "Flow",
          type: "sequential",
          steps: [{ agent: "a" }],
        }),
      ).toBe(false);
    });

    it("returns false for null", () => {
      expect(isAgentStep(null)).toBe(false);
    });
  });

  describe("isFlowDef", () => {
    it("returns true for flow definitions", () => {
      expect(
        isFlowDef({
          name: "Flow",
          type: "sequential",
          steps: [{ agent: "a" }],
        }),
      ).toBe(true);
    });

    it("returns false for agent reference steps", () => {
      expect(isFlowDef({ agent: "writer" })).toBe(false);
    });

    it("returns false for null", () => {
      expect(isFlowDef(null)).toBe(false);
    });
  });
});

// BUILT_IN_TOOL_NAMES

describe("BUILT_IN_TOOL_NAMES", () => {
  it("contains exactly the expected tool names", () => {
    expect([...BUILT_IN_TOOL_NAMES]).toEqual([
      "read_file",
      "list_directory",
      "search_files",
      "glob",
      "create_file",
      "write_file",
      "edit_file",
      "delete_file",
      "restore_file",
      "move_file",
      // "apply_patch",
      "run_command",
      "webfetch",
      "load_skill",
      "list_skills",
      "list_strategy",
      "launch_strategy",
      "todo_add",
      "todo_complete",
      "todo_get",
      "todo_get_next",
      "todo_remove",
      "todo_clear",
      "ask_question",
      "lsp_request",
    ]);
  });
});
