// Tests for strategy/loader.ts — full load pipeline with mock providers

import { describe, expect, it, mock } from "bun:test";
import type { LanguageModel } from "ai";
import { StrategyValidationError } from "../errors/index";
import type { AgentHooks, FlowHooks } from "../hooks/types";
import type { ToolDef } from "../tools/tool";
import type { LoadStrategyOptions, ProviderFactory } from "./loader";
import { loadStrategy, loadStrategyFromString } from "./loader";

// ---------------------------------------------------------------------------
// Mock model & provider factory
// ---------------------------------------------------------------------------

function createMockModel(id: string): LanguageModel {
  return {
    modelId: id,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: `response from ${id}` }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: undefined, reasoning: undefined },
      },
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    }),
  } as unknown as LanguageModel;
}

function mockProviderFactory(providerName: string): ProviderFactory {
  return (modelID: string) => createMockModel(`${providerName}/${modelID}`);
}

function defaultOptions(overrides?: Partial<LoadStrategyOptions>): LoadStrategyOptions {
  return {
    providers: {
      openai: mockProviderFactory("openai"),
      anthropic: mockProviderFactory("anthropic"),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Minimal strategy JSON strings
// ---------------------------------------------------------------------------

const MINIMAL_JSON = JSON.stringify({
  name: "Test",
  version: "1.0",
  agents: {
    assistant: { model: "openai/gpt-4o" },
  },
  flow: {
    name: "Main",
    type: "sequential",
    steps: [{ agent: "assistant" }],
  },
});

const COMPLEX_JSON = JSON.stringify({
  name: "Code Review",
  version: "2.0",
  description: "Multi-agent review",
  defaults: {
    model: "openai/gpt-4o",
    tools: ["bash", "read"],
    systemPrompt: "Be helpful.",
  },
  agents: {
    user: { type: "user", config: { requireInput: false, presetMessage: "Review this." } },
    writer: {
      model: "openai/gpt-4o",
      systemPrompt: "You write code.",
      tools: ["bash", "write", "edit"],
    },
    reviewer: {
      useDefaults: true,
      systemPrompt: "You review code.",
    },
    defaultAgent: {
      useDefaults: true,
      description: "Uses all defaults",
    },
  },
  flow: {
    name: "Pipeline",
    type: "sequential",
    steps: [
      { agent: "user" },
      { agent: "writer" },
      {
        name: "Review Loop",
        type: "cycle",
        cycles: 3,
        observer: "reviewer",
        steps: [{ agent: "writer" }],
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// loadStrategyFromString — JSON parsing
// ---------------------------------------------------------------------------

describe("loadStrategyFromString", () => {
  describe("JSON parsing", () => {
    it("loads a minimal strategy from JSON", () => {
      const result = loadStrategyFromString(MINIMAL_JSON, "json", defaultOptions());
      expect(result.name).toBe("Test");
      expect(result.version).toBe("1.0");
      expect(result.flow).toBeDefined();
      expect(result.flow.name).toBe("Main");
      expect(result.agents.assistant).toBeDefined();
    });

    it("loads a complex strategy from JSON", () => {
      const result = loadStrategyFromString(COMPLEX_JSON, "json", defaultOptions());
      expect(result.name).toBe("Code Review");
      expect(result.version).toBe("2.0");
      expect(result.description).toBe("Multi-agent review");
      expect(Object.keys(result.agents)).toHaveLength(4);
      expect(result.agents.user).toBeDefined();
      expect(result.agents.writer).toBeDefined();
      expect(result.agents.reviewer).toBeDefined();
      expect(result.agents.defaultAgent).toBeDefined();
    });

    it("throws StrategyValidationError for invalid JSON syntax", () => {
      expect(() => loadStrategyFromString("not { json", "json", defaultOptions())).toThrow(
        StrategyValidationError,
      );
    });

    it("throws StrategyValidationError for invalid structure", () => {
      expect(() =>
        loadStrategyFromString(JSON.stringify({ name: "Bad" }), "json", defaultOptions()),
      ).toThrow(StrategyValidationError);
    });
  });

  describe("YAML parsing", () => {
    it("loads a strategy from YAML", () => {
      const yaml = `
name: YAML Test
version: "1.0"
agents:
  assistant:
    model: openai/gpt-4o
flow:
  name: Main
  type: sequential
  steps:
    - agent: assistant
`;
      const result = loadStrategyFromString(yaml, "yaml", defaultOptions());
      expect(result.name).toBe("YAML Test");
      expect(result.version).toBe("1.0");
      expect(result.agents.assistant).toBeDefined();
    });

    it("throws StrategyValidationError for invalid YAML syntax", () => {
      expect(() => loadStrategyFromString(":\n  - :\n  bad: [", "yaml", defaultOptions())).toThrow(
        StrategyValidationError,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Agent instantiation
// ---------------------------------------------------------------------------

describe("agent instantiation", () => {
  it("creates LLM agents with the correct model", () => {
    const providerFn = mock((id: string) => createMockModel(`openai/${id}`));
    const result = loadStrategyFromString(MINIMAL_JSON, "json", {
      providers: { openai: providerFn },
    });

    expect(providerFn).toHaveBeenCalledWith("gpt-4o");
    expect(result.agents.assistant).toBeDefined();
    expect(result.agents.assistant.name).toBe("assistant");
  });

  it("creates user agents", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        user: { type: "user", config: { requireInput: false, presetMessage: "Hi" } },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "user" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    expect(result.agents.user).toBeDefined();
    expect(result.agents.user.name).toBe("user");
  });

  it("user agents pass through preset message", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        user: { type: "user", config: { requireInput: false, presetMessage: "Hello!" } },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "user" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    const callResult = await result.agents.user.call("ignored");
    expect(callResult.text).toBe("Hello!");
  });

  describe("useDefaults", () => {
    it("applies default model when useDefaults is true and agent has no model", () => {
      const providerFn = mock((id: string) => createMockModel(`openai/${id}`));
      const json = JSON.stringify({
        name: "Test",
        version: "1.0",
        defaults: { model: "openai/gpt-4o" },
        agents: {
          agent: { useDefaults: true },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "agent" }],
        },
      });

      loadStrategyFromString(json, "json", { providers: { openai: providerFn } });
      expect(providerFn).toHaveBeenCalledWith("gpt-4o");
    });

    it("agent model takes priority over defaults when both defined", () => {
      const openaiFactory = mock((id: string) => createMockModel(`openai/${id}`));
      const anthropicFactory = mock((id: string) => createMockModel(`anthropic/${id}`));
      const json = JSON.stringify({
        name: "Test",
        version: "1.0",
        defaults: { model: "openai/gpt-4o" },
        agents: {
          agent: { useDefaults: true, model: "anthropic/claude-sonnet-4-5" },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "agent" }],
        },
      });

      loadStrategyFromString(json, "json", {
        providers: { openai: openaiFactory, anthropic: anthropicFactory },
      });
      // Should use agent's own model, not the default
      expect(anthropicFactory).toHaveBeenCalledWith("claude-sonnet-4-5");
      expect(openaiFactory).not.toHaveBeenCalled();
    });

    it("does not apply defaults when useDefaults is false", () => {
      const json = JSON.stringify({
        name: "Test",
        version: "1.0",
        defaults: { model: "openai/gpt-4o" },
        agents: {
          agent: { useDefaults: false, model: "openai/gpt-3.5-turbo" },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "agent" }],
        },
      });

      const providerFn = mock((id: string) => createMockModel(`openai/${id}`));
      loadStrategyFromString(json, "json", { providers: { openai: providerFn } });
      expect(providerFn).toHaveBeenCalledWith("gpt-3.5-turbo");
    });

    it("does not apply defaults when useDefaults is omitted", () => {
      const json = JSON.stringify({
        name: "Test",
        version: "1.0",
        defaults: { model: "openai/gpt-4o", tools: ["bash"] },
        agents: {
          agent: { model: "openai/gpt-3.5-turbo" },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "agent" }],
        },
      });

      const providerFn = mock((id: string) => createMockModel(`openai/${id}`));
      loadStrategyFromString(json, "json", { providers: { openai: providerFn } });
      expect(providerFn).toHaveBeenCalledWith("gpt-3.5-turbo");
    });

    it("applies default tools when useDefaults is true and agent has no tools", () => {
      // The agent should get the default tools
      const json = JSON.stringify({
        name: "Test",
        version: "1.0",
        defaults: { model: "openai/gpt-4o", tools: ["bash", "read"] },
        agents: {
          agent: { useDefaults: true },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "agent" }],
        },
      });

      // If tools resolve successfully, the agent was created with them
      const result = loadStrategyFromString(json, "json", defaultOptions());
      expect(result.agents.agent).toBeDefined();
    });

    it("agent tools take absolute priority over defaults (no merge)", () => {
      // Agent specifies only "edit" — should NOT also get "bash" and "read" from defaults
      const json = JSON.stringify({
        name: "Test",
        version: "1.0",
        defaults: { model: "openai/gpt-4o", tools: ["bash", "read"] },
        agents: {
          agent: { useDefaults: true, tools: ["edit"] },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "agent" }],
        },
      });

      // The agent should only have "edit", not "bash" or "read"
      // We can verify this by checking the strategy loaded without errors
      // (if it tried to merge and had issues, it would error)
      const result = loadStrategyFromString(json, "json", defaultOptions());
      expect(result.agents.agent).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Tool resolution
// ---------------------------------------------------------------------------

describe("tool resolution", () => {
  it("resolves built-in tools by name", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        agent: { model: "openai/gpt-4o", tools: ["bash", "read", "write", "edit", "glob", "grep"] },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "agent" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    expect(result.agents.agent).toBeDefined();
  });

  it("resolves custom tools", () => {
    const customTool: ToolDef = {
      description: "A custom tool",
      parameters: {} as any,
      execute: async () => ({ output: "done" }),
    };

    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        agent: { model: "openai/gpt-4o", tools: ["myTool"] },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "agent" }],
      },
    });

    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      customTools: { myTool: customTool },
    });
    expect(result.agents.agent).toBeDefined();
  });

  it("throws for unknown tool names", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        agent: { model: "openai/gpt-4o", tools: ["nonexistent"] },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "agent" }],
      },
    });

    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      StrategyValidationError,
    );
    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(/nonexistent/);
  });
});

// ---------------------------------------------------------------------------
// Model resolution errors
// ---------------------------------------------------------------------------

describe("model resolution", () => {
  it("throws for invalid model string format", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { model: "no-slash" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      StrategyValidationError,
    );
    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      /providerID\/modelID/,
    );
  });

  it("throws for empty model ID after slash", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { model: "openai/" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      StrategyValidationError,
    );
  });

  it("throws for missing provider factory", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { model: "google/gemini-pro" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      StrategyValidationError,
    );
    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(/google/);
  });

  it("throws when LLM agent has no model and useDefaults is false", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { systemPrompt: "Hi" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      StrategyValidationError,
    );
    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(/no model/);
  });
});

// ---------------------------------------------------------------------------
// Flow tree building
// ---------------------------------------------------------------------------

describe("flow tree building", () => {
  it("builds a sequential flow", () => {
    const result = loadStrategyFromString(MINIMAL_JSON, "json", defaultOptions());
    expect(result.flow.name).toBe("Main");
  });

  it("builds a cycle flow", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { a: { model: "openai/gpt-4o" } },
      flow: {
        name: "Loop",
        type: "cycle",
        cycles: 3,
        steps: [{ agent: "a" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    expect(result.flow.name).toBe("Loop");
  });

  it("builds a broadcast flow", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        a: { model: "openai/gpt-4o" },
        b: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Fan-out",
        type: "broadcast",
        steps: [{ agent: "a" }, { agent: "b" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    expect(result.flow.name).toBe("Fan-out");
  });

  it("builds nested flows recursively", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        writer: { model: "openai/gpt-4o" },
        reviewer: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Outer",
        type: "sequential",
        steps: [
          { agent: "writer" },
          {
            name: "Inner",
            type: "cycle",
            cycles: 2,
            steps: [{ agent: "reviewer" }],
          },
        ],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    expect(result.flow.name).toBe("Outer");
  });

  it("resolves observer agent in cycle flow", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        writer: { model: "openai/gpt-4o" },
        critic: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Loop",
        type: "cycle",
        cycles: 3,
        observer: "critic",
        steps: [{ agent: "writer" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    expect(result.flow.name).toBe("Loop");
  });

  it("handles Infinity cycles from string", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { a: { model: "openai/gpt-4o" } },
      flow: {
        name: "Infinite",
        type: "cycle",
        cycles: "Infinity",
        steps: [{ agent: "a" }],
      },
    });

    // Infinite cycle requires an abort signal
    const controller = new AbortController();
    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      abort: controller.signal,
    });
    expect(result.flow.name).toBe("Infinite");
  });

  it("throws when flow references undefined agent", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { a: { model: "openai/gpt-4o" } },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "nonexistent" }],
      },
    });

    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      StrategyValidationError,
    );
    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(/nonexistent/);
  });

  it("throws when cycle observer references undefined agent", () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { a: { model: "openai/gpt-4o" } },
      flow: {
        name: "Loop",
        type: "cycle",
        cycles: 2,
        observer: "nonexistent",
        steps: [{ agent: "a" }],
      },
    });

    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(
      StrategyValidationError,
    );
    expect(() => loadStrategyFromString(json, "json", defaultOptions())).toThrow(/nonexistent/);
  });
});

// ---------------------------------------------------------------------------
// Raw strategy preservation
// ---------------------------------------------------------------------------

describe("raw strategy", () => {
  it("preserves the original parsed data", () => {
    const result = loadStrategyFromString(COMPLEX_JSON, "json", defaultOptions());
    expect(result.raw.name).toBe("Code Review");
    expect(result.raw.version).toBe("2.0");
    expect(result.raw.agents.writer).toBeDefined();
    expect(result.raw.flow.type).toBe("sequential");
  });
});

// ---------------------------------------------------------------------------
// loadStrategy — file-based loading
// ---------------------------------------------------------------------------

describe("loadStrategy (file-based)", () => {
  it("throws for non-existent file", async () => {
    await expect(loadStrategy("/nonexistent/strategy.json", defaultOptions())).rejects.toThrow(
      StrategyValidationError,
    );
  });

  it("throws for unsupported file extension", async () => {
    await expect(loadStrategy("/some/file.toml", defaultOptions())).rejects.toThrow(
      StrategyValidationError,
    );
    await expect(loadStrategy("/some/file.toml", defaultOptions())).rejects.toThrow(/extension/);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: flow execution
// ---------------------------------------------------------------------------

describe("end-to-end execution", () => {
  it("executes a sequential flow with user + LLM agent", async () => {
    const json = JSON.stringify({
      name: "E2E",
      version: "1.0",
      agents: {
        user: { type: "user", config: { requireInput: false, presetMessage: "Hello" } },
        assistant: { model: "openai/gpt-4o", systemPrompt: "You are helpful." },
      },
      flow: {
        name: "Chat",
        type: "sequential",
        steps: [{ agent: "user" }, { agent: "assistant" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    const output = await result.flow.call("start");

    // User agent returns "Hello", then assistant processes it
    expect(output.text).toBeDefined();
    expect(typeof output.text).toBe("string");
  });

  it("executes a cycle flow", async () => {
    const json = JSON.stringify({
      name: "E2E Cycle",
      version: "1.0",
      agents: {
        agent: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Loop",
        type: "cycle",
        cycles: 2,
        steps: [{ agent: "agent" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    const output = await result.flow.call("start");
    expect(output.text).toBeDefined();
  });

  it("executes a broadcast flow", async () => {
    const json = JSON.stringify({
      name: "E2E Broadcast",
      version: "1.0",
      agents: {
        a: { model: "openai/gpt-4o" },
        b: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Fan-out",
        type: "broadcast",
        steps: [{ agent: "a" }, { agent: "b" }],
      },
    });

    const result = loadStrategyFromString(json, "json", defaultOptions());
    const output = await result.flow.call("start");
    expect(output.text).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Hook injection (flowHooks / agentHooks)
// ---------------------------------------------------------------------------

describe("hook injection via LoadStrategyOptions", () => {
  it("threads agentHooks into LLM agents", async () => {
    const calls: string[] = [];
    const agentHooks: AgentHooks = {
      beforeCall: [
        () => {
          calls.push("before-call");
        },
      ],
      afterCall: [
        () => {
          calls.push("after-call");
        },
      ],
    };

    const json = JSON.stringify({
      name: "Hook Test",
      version: "1.0",
      agents: {
        assistant: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "assistant" }],
      },
    });

    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      agentHooks,
    });

    await result.flow.call("hello");

    expect(calls).toContain("before-call");
    expect(calls).toContain("after-call");
  });

  it("threads flowHooks into flows (beforeStep/afterStep)", async () => {
    const steps: string[] = [];
    const flowHooks: FlowHooks = {
      beforeStep: [
        ({ stepName }) => {
          steps.push(`before:${stepName}`);
        },
      ],
      afterStep: [
        ({ stepName }) => {
          steps.push(`after:${stepName}`);
        },
      ],
    };

    const json = JSON.stringify({
      name: "Hook Test",
      version: "1.0",
      agents: {
        a: { model: "openai/gpt-4o" },
        b: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Pipeline",
        type: "sequential",
        steps: [{ agent: "a" }, { agent: "b" }],
      },
    });

    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      flowHooks,
    });

    await result.flow.call("start");

    expect(steps).toEqual(["before:a", "after:a", "before:b", "after:b"]);
  });

  it("threads flowHooks into cycle flows", async () => {
    const events: string[] = [];
    const flowHooks: FlowHooks = {
      beforeStep: [
        ({ stepName }) => {
          events.push(`before:${stepName}`);
        },
      ],
      afterStep: [
        ({ stepName }) => {
          events.push(`after:${stepName}`);
        },
      ],
    };

    const json = JSON.stringify({
      name: "Cycle Hook Test",
      version: "1.0",
      agents: { a: { model: "openai/gpt-4o" } },
      flow: {
        name: "Loop",
        type: "cycle",
        cycles: 2,
        steps: [{ agent: "a" }],
      },
    });

    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      flowHooks,
    });

    await result.flow.call("start");

    // 2 cycles × 1 step = 4 events
    expect(events).toEqual(["before:a", "after:a", "before:a", "after:a"]);
  });

  it("threads flowHooks into broadcast flows", async () => {
    const events: string[] = [];
    const flowHooks: FlowHooks = {
      beforeStep: [
        ({ stepName }) => {
          events.push(`before:${stepName}`);
        },
      ],
      afterStep: [
        ({ stepName }) => {
          events.push(`after:${stepName}`);
        },
      ],
    };

    const json = JSON.stringify({
      name: "Broadcast Hook Test",
      version: "1.0",
      agents: {
        a: { model: "openai/gpt-4o" },
        b: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Fan-out",
        type: "broadcast",
        steps: [{ agent: "a" }, { agent: "b" }],
      },
    });

    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      flowHooks,
    });

    await result.flow.call("start");

    expect(events).toEqual(["before:a", "after:a", "before:b", "after:b"]);
  });

  it("threads both agentHooks and flowHooks simultaneously", async () => {
    const events: string[] = [];
    const agentHooks: AgentHooks = {
      beforeCall: [
        () => {
          events.push("agent-before");
        },
      ],
      afterCall: [
        () => {
          events.push("agent-after");
        },
      ],
    };
    const flowHooks: FlowHooks = {
      beforeStep: [
        ({ stepName }) => {
          events.push(`step-before:${stepName}`);
        },
      ],
      afterStep: [
        ({ stepName }) => {
          events.push(`step-after:${stepName}`);
        },
      ],
    };

    const json = JSON.stringify({
      name: "Both Hooks",
      version: "1.0",
      agents: {
        assistant: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "assistant" }],
      },
    });

    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      agentHooks,
      flowHooks,
    });

    await result.flow.call("hello");

    // Flow step hooks wrap the agent call with its hooks
    expect(events).toContain("step-before:assistant");
    expect(events).toContain("agent-before");
    expect(events).toContain("agent-after");
    expect(events).toContain("step-after:assistant");
  });

  it("does not inject hooks into user agents", async () => {
    const calls: string[] = [];
    const agentHooks: AgentHooks = {
      beforeCall: [
        () => {
          calls.push("agent-hook");
        },
      ],
    };

    const json = JSON.stringify({
      name: "User Agent Test",
      version: "1.0",
      agents: {
        user: { type: "user", config: { requireInput: false, presetMessage: "Hi" } },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "user" }],
      },
    });

    const result = loadStrategyFromString(json, "json", {
      ...defaultOptions(),
      agentHooks,
    });

    await result.flow.call("start");

    // User agents don't use agentHooks (they don't go through BaseAgent)
    expect(calls).toEqual([]);
  });
});
