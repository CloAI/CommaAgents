// Tests for strategy/loader.ts — full load pipeline with model registry

import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { hookIntoAgent } from "../../agents/hook-into-agent/hook-into-agent";
import type { AgentHooks } from "../../agents/hooks/hooks.types";
import { StrategyValidationError } from "../../errors/index";
import type { FlowHooks } from "../../flows/flow/flow.types";
import { registerModel, resetModelRegistry } from "../../model/model";
import { extractProviderIds } from "../../model/model.utils";
import { createSkillRegistry } from "../../skills/skills.registry";
import { okResult } from "../../tools/result";
import { registerTool, resetToolRegistry } from "../../tools/tool.registry";
import type { ToolDefinition } from "../../tools/tool.types";
import { loadStrategy, loadStrategyFromString } from "./loader";
import { loadProject } from "./project-loader";

// Mock model registration

/** Register a mock model for a given model string in the global registry. */
function registerMockModel(modelString: string): void {
  registerModel(modelString, {
    modelId: modelString,
    specificationVersion: "v3",
    provider: "mock",
    defaultObjectGenerationMode: undefined,
    doGenerate: async () => ({
      content: [
        { type: "text" as const, text: `response from ${modelString}` },
      ],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: {
          total: 10,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
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
  registerMockModel("openai/gpt-3.5-turbo");
  registerMockModel("anthropic/claude-sonnet-4-5");
}

// Cleanup

afterEach(() => {
  resetModelRegistry();
  resetToolRegistry();
});

// Minimal strategy JSON strings

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
  agents: {
    user: {
      type: "user",
      config: { requireInput: false, presetMessage: "Review this." },
    },
    writer: {
      model: "openai/gpt-4o",
      systemPrompt: "You write code.",
      tools: ["run_command", "write_file", "edit_file"],
    },
    reviewer: {
      model: "anthropic/claude-sonnet-4-5",
      systemPrompt: "You review code.",
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

// loadStrategyFromString — JSON parsing

describe("loadStrategyFromString", () => {
  describe("JSON parsing", () => {
    it("loads a minimal strategy from JSON", async () => {
      setupMockModels();
      const result = await loadStrategyFromString(MINIMAL_JSON, "json");
      expect(result.name).toBe("Test");
      expect(result.version).toBe("1.0");
      expect(result.flow).toBeDefined();
      expect(result.flow.name).toBe("Main");
      expect(result.agents.assistant).toBeDefined();
    });

    it("loads a complex strategy from JSON", async () => {
      setupMockModels();
      const result = await loadStrategyFromString(COMPLEX_JSON, "json");
      expect(result.name).toBe("Code Review");
      expect(result.version).toBe("2.0");
      expect(result.description).toBe("Multi-agent review");
      expect(Object.keys(result.agents)).toHaveLength(3);
      expect(result.agents.user).toBeDefined();
      expect(result.agents.writer).toBeDefined();
      expect(result.agents.reviewer).toBeDefined();
    });

    it("throws StrategyValidationError for invalid JSON syntax", async () => {
      await expect(
        loadStrategyFromString("not { json", "json"),
      ).rejects.toThrow(StrategyValidationError);
    });

    it("throws StrategyValidationError for invalid structure", async () => {
      await expect(
        loadStrategyFromString(JSON.stringify({ name: "Bad" }), "json"),
      ).rejects.toThrow(StrategyValidationError);
    });
  });

  describe("YAML parsing", () => {
    it("loads a strategy from YAML", async () => {
      setupMockModels();
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
      const result = await loadStrategyFromString(yaml, "yaml");
      expect(result.name).toBe("YAML Test");
      expect(result.version).toBe("1.0");
      expect(result.agents.assistant).toBeDefined();
    });

    it("throws StrategyValidationError for invalid YAML syntax", async () => {
      await expect(
        loadStrategyFromString(":\n  - :\n  bad: [", "yaml"),
      ).rejects.toThrow(StrategyValidationError);
    });
  });
});

// Agent instantiation

describe("agent instantiation", () => {
  it("creates LLM agents with the correct model", async () => {
    setupMockModels();
    const result = await loadStrategyFromString(MINIMAL_JSON, "json");

    expect(result.agents.assistant).toBeDefined();
    expect(result.agents.assistant?.name).toBe("assistant");
  });

  it("creates user agents", async () => {
    setupMockModels();
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        user: {
          type: "user",
          config: { requireInput: false, presetMessage: "Hi" },
        },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "user" }],
      },
    });

    const result = await loadStrategyFromString(json, "json");
    expect(result.agents.user).toBeDefined();
    expect(result.agents.user?.name).toBe("user");
  });

  it("loads required skills while advertising every available skill", async () => {
    setupMockModels();
    const skillRegistry = createSkillRegistry();
    skillRegistry.register({
      name: "required-skill",
      description: "Required conventions.",
      content: "Always follow the required convention.",
      sourcePath: "/skills/required-skill/SKILL.md",
      origin: "global",
    });
    skillRegistry.register({
      name: "optional-skill",
      description: "Optional conventions.",
      content: "Optional details.",
      sourcePath: "/skills/optional-skill/SKILL.md",
      origin: "global",
    });

    const result = await loadStrategyFromString(
      JSON.stringify({
        name: "Skills",
        version: "1.0",
        agents: {
          assistant: {
            model: "openai/gpt-4o",
            systemPromptTemplate: { template: "You are {{ role }}." },
            skills: ["required-skill"],
          },
        },
        flow: {
          name: "Main",
          type: "sequential",
          steps: [{ agent: "assistant" }],
        },
      }),
      "json",
      { skillRegistry },
    );

    const prompt = result.agents.assistant?.config?.systemPrompt;
    expect(prompt).toBeDefined();
    expect(JSON.stringify(prompt)).toContain("optional-skill");
    expect(JSON.stringify(prompt)).toContain(
      "Always follow the required convention.",
    );
  });

  it("rejects an agent that requires an unknown skill", async () => {
    setupMockModels();
    const skillRegistry = createSkillRegistry();

    await expect(
      loadStrategyFromString(
        JSON.stringify({
          name: "Skills",
          version: "1.0",
          agents: {
            assistant: {
              model: "openai/gpt-4o",
              skills: ["missing-skill"],
            },
          },
          flow: {
            name: "Main",
            type: "sequential",
            steps: [{ agent: "assistant" }],
          },
        }),
        "json",
        { skillRegistry },
      ),
    ).rejects.toThrow('requires unknown skill "missing-skill"');
  });

  it("user agents pass through preset message", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        user: {
          type: "user",
          config: { requireInput: false, presetMessage: "Hello!" },
        },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "user" }],
      },
    });

    const result = await loadStrategyFromString(json, "json");
    const callResult = await result.agents.user?.call("ignored");
    expect(callResult.text).toBe("Hello!");
  });

  it("rejects strategies with defaults block (removed feature)", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      defaults: { model: "openai/gpt-4o" },
      agents: {
        agent: { model: "openai/gpt-4o" },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "agent" }],
      },
    });

    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      StrategyValidationError,
    );
  });

  it("rejects strategies with useDefaults (removed feature)", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        agent: { useDefaults: true, model: "openai/gpt-4o" },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "agent" }],
      },
    });

    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      StrategyValidationError,
    );
  });
});

// Tool resolution

describe("tool resolution", () => {
  it("resolves built-in tools by name", async () => {
    setupMockModels();
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: {
        agent: {
          model: "openai/gpt-4o",
          tools: [
            "run_command",
            "read_file",
            "write_file",
            "edit_file",
            "search_files",
          ],
        },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "agent" }],
      },
    });

    const result = await loadStrategyFromString(json, "json");
    expect(result.agents.agent).toBeDefined();
  });

  it("resolves custom tools via registerTool", async () => {
    setupMockModels();
    const customTool: ToolDefinition = {
      description: "A custom tool",
      parameters: {} as any,
      execute: async () => okResult("done"),
    };

    // Register the custom tool globally
    registerTool("myTool", customTool);

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

    const result = await loadStrategyFromString(json, "json");
    expect(result.agents.agent).toBeDefined();
  });

  it("throws for unknown tool names", async () => {
    setupMockModels();
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

    // In CommaAgents v2, tool validation happens at load time.
    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      /nonexistent/,
    );
  });
});

// Model resolution errors

describe("model resolution", () => {
  it("throws for invalid model string format at call time", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { model: "no-slash" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    // Loading succeeds — model string is just passed through
    const result = await loadStrategyFromString(json, "json");
    expect(result.agents.agent).toBeDefined();

    // Calling the agent fails — resolveModel() rejects the format
    await expect(result.agents.agent?.call("test")).rejects.toThrow(
      /providerID\/modelID/,
    );
  });

  it("throws for empty model ID after slash at call time", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { model: "openai/" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    // Loading succeeds
    const result = await loadStrategyFromString(json, "json");
    expect(result.agents.agent).toBeDefined();

    // Calling fails — model ID is empty
    await expect(result.agents.agent?.call("test")).rejects.toThrow();
  });

  it("throws for unregistered provider at call time", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { model: "google/gemini-pro" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    // Loading succeeds — no model resolution at load time
    const result = await loadStrategyFromString(json, "json");
    expect(result.agents.agent).toBeDefined();

    // Calling fails — "google/gemini-pro" is not registered
    await expect(result.agents.agent?.call("test")).rejects.toThrow(/google/);
  });

  it("throws when LLM agent has no model at load time", async () => {
    const json = JSON.stringify({
      name: "Test",
      version: "1.0",
      agents: { agent: { systemPrompt: "Hi" } },
      flow: { name: "Main", type: "sequential", steps: [{ agent: "agent" }] },
    });

    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      StrategyValidationError,
    );
    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      /no model/,
    );
  });
});

// Flow tree building

describe("flow tree building", () => {
  it("builds a sequential flow", async () => {
    setupMockModels();
    const result = await loadStrategyFromString(MINIMAL_JSON, "json");
    expect(result.flow.name).toBe("Main");
  });

  it("builds a cycle flow", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json");
    expect(result.flow.name).toBe("Loop");
  });

  it("builds a broadcast flow", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json");
    expect(result.flow.name).toBe("Fan-out");
  });

  it("builds nested flows recursively", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json");
    expect(result.flow.name).toBe("Outer");
  });

  it("resolves observer agent in cycle flow", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json");
    expect(result.flow.name).toBe("Loop");
  });

  it("handles Infinity cycles from string", async () => {
    setupMockModels();
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

    // Infinite cycle no longer requires an abort signal
    const result = await loadStrategyFromString(json, "json");
    expect(result.flow.name).toBe("Infinite");
  });

  it("throws when flow references undefined agent", async () => {
    setupMockModels();
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

    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      StrategyValidationError,
    );
    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      /nonexistent/,
    );
  });

  it("throws when cycle observer references undefined agent", async () => {
    setupMockModels();
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

    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      StrategyValidationError,
    );
    await expect(loadStrategyFromString(json, "json")).rejects.toThrow(
      /nonexistent/,
    );
  });
});

// Raw strategy preservation

describe("raw strategy", () => {
  it("preserves the original parsed data", async () => {
    setupMockModels();
    const result = await loadStrategyFromString(COMPLEX_JSON, "json");
    expect(result.raw.name).toBe("Code Review");
    expect(result.raw.version).toBe("2.0");
    expect(result.raw.agents.writer).toBeDefined();
    expect(result.raw.flow.type).toBe("sequential");
  });
});

// loadStrategy — file-based loading

describe("loadStrategy (file-based)", () => {
  it("throws for non-existent file", async () => {
    await expect(loadStrategy("/nonexistent/strategy.json")).rejects.toThrow(
      StrategyValidationError,
    );
  });

  it("throws for unsupported file extension", async () => {
    await expect(loadStrategy("/some/file.toml")).rejects.toThrow(
      StrategyValidationError,
    );
    await expect(loadStrategy("/some/file.toml")).rejects.toThrow(/extension/);
  });
});

// End-to-end: flow execution

describe("end-to-end execution", () => {
  it("executes a sequential flow with user + LLM agent", async () => {
    setupMockModels();
    const json = JSON.stringify({
      name: "E2E",
      version: "1.0",
      agents: {
        user: {
          type: "user",
          config: { requireInput: false, presetMessage: "Hello" },
        },
        assistant: { model: "openai/gpt-4o", systemPrompt: "You are helpful." },
      },
      flow: {
        name: "Chat",
        type: "sequential",
        steps: [{ agent: "user" }, { agent: "assistant" }],
      },
    });

    const result = await loadStrategyFromString(json, "json");
    const output = await result.flow.call("start");

    // User agent returns "Hello", then assistant processes it
    expect(output.text).toBeDefined();
    expect(typeof output.text).toBe("string");
  });

  it("executes a cycle flow", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json");
    const output = await result.flow.call("start");
    expect(output.text).toBeDefined();
  });

  it("executes a broadcast flow", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json");
    const output = await result.flow.call("start");
    expect(output.text).toBeDefined();
  });
});

// Hook injection (flowHooks via options, agentHooks via hookIntoAgent)

describe("hook injection", () => {
  it("threads agentHooks into LLM agents via hookIntoAgent post-load", async () => {
    setupMockModels();
    const calls: string[] = [];
    const agentHooks: AgentHooks = {
      beforeCall: [
        () => {
          calls.push("before-call");
        },
      ],
      afterCallResult: [
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

    const result = await loadStrategyFromString(json, "json");

    // Inject hooks post-load via hookIntoAgent
    for (const agent of Object.values(result.agents)) {
      if (agent.appendHook) {
        hookIntoAgent(agent, agentHooks);
      }
    }

    await result.flow.call("hello");

    expect(calls).toContain("before-call");
    expect(calls).toContain("after-call");
  });

  it("threads flowHooks into flows (beforeStep/afterStep)", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json", {
      flowHooks,
    });

    await result.flow.call("start");

    expect(steps).toEqual(["before:a", "after:a", "before:b", "after:b"]);
  });

  it("threads flowHooks into cycle flows", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json", {
      flowHooks,
    });

    await result.flow.call("start");

    // 2 cycles × 1 step = 4 events
    expect(events).toEqual(["before:a", "after:a", "before:a", "after:a"]);
  });

  it("threads flowHooks into broadcast flows", async () => {
    setupMockModels();
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

    const result = await loadStrategyFromString(json, "json", {
      flowHooks,
    });

    await result.flow.call("start");

    expect(events).toEqual(["before:a", "after:a", "before:b", "after:b"]);
  });

  it("threads both agentHooks (via hookIntoAgent) and flowHooks simultaneously", async () => {
    setupMockModels();
    const events: string[] = [];
    const agentHooks: AgentHooks = {
      beforeCall: [
        () => {
          events.push("agent-before");
        },
      ],
      afterCallResult: [
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

    const result = await loadStrategyFromString(json, "json", {
      flowHooks,
    });

    // Inject agent hooks post-load
    for (const agent of Object.values(result.agents)) {
      if (agent.appendHook) {
        hookIntoAgent(agent, agentHooks);
      }
    }

    await result.flow.call("hello");

    // Flow step hooks wrap the agent call with its hooks
    expect(events).toContain("step-before:assistant");
    expect(events).toContain("agent-before");
    expect(events).toContain("agent-after");
    expect(events).toContain("step-after:assistant");
  });

  it("injects hooks into user agents (they support appendHook via createAgent)", async () => {
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
        user: {
          type: "user",
          config: { requireInput: false, presetMessage: "Hi" },
        },
      },
      flow: {
        name: "Main",
        type: "sequential",
        steps: [{ agent: "user" }],
      },
    });

    const result = await loadStrategyFromString(json, "json");

    // User agents are built on createAgent, so they support appendHook
    for (const agent of Object.values(result.agents)) {
      if (agent.appendHook) {
        hookIntoAgent(agent, agentHooks);
      }
    }

    await result.flow.call("start");

    // User agents support hooks — the hook fires
    expect(calls).toEqual(["agent-hook"]);
  });
});

// extractProviderIds

describe("extractProviderIds", () => {
  it("should extract provider IDs from agent model strings", () => {
    const raw = {
      agents: {
        writer: { model: "openai/gpt-4o" },
        reviewer: { model: "anthropic/claude-3.5-sonnet" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["openai", "anthropic"]));
  });

  it("should deduplicate provider IDs", () => {
    const raw = {
      agents: {
        first: { model: "openai/gpt-4o" },
        second: { model: "openai/gpt-3.5-turbo" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["openai"]));
    expect(ids.size).toBe(1);
  });

  it("should skip agents without model strings", () => {
    const raw = {
      agents: {
        user: { type: "user" },
        assistant: { model: "openai/gpt-4o" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["openai"]));
  });

  it("should return empty set when no models are present", () => {
    const raw = {
      agents: {
        user: { type: "user" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids.size).toBe(0);
  });

  it("should skip invalid model strings without throwing", () => {
    const raw = {
      agents: {
        broken: { model: "no-slash" },
        valid: { model: "openai/gpt-4o" },
      },
    };
    const ids = extractProviderIds(raw);
    expect(ids).toEqual(new Set(["openai"]));
  });
});

describe("JSONC support and systemPrompt file path loading", () => {
  it("should parse JSON with comments (JSONC) in loadStrategyFromString", async () => {
    setupMockModels();
    const jsoncStr = `{
      // This is a single line comment
      "name": "JSONC Strategy",
      "version": "1.0", /* This is a multi-line comment */
      "agents": {
        "assistant": {
          "model": "openai/gpt-4o",
          "systemPrompt": "You are a helpful JSONC parsed assistant."
        }
      },
      "flow": {
        "name": "SingleStep",
        "type": "sequential",
        "steps": [
          { "agent": "assistant" }
        ]
      }
    }`;
    const result = await loadStrategyFromString(jsoncStr, "json");
    expect(result.name).toBe("JSONC Strategy");
    expect(result.agents.assistant).toBeDefined();
  });

  it("should resolve and load systemPrompt from relative txt/md file paths", async () => {
    setupMockModels();
    const tempDir = resolve(__dirname, "test_temp_prompts");
    await mkdir(tempDir, { recursive: true });

    const txtPath = join(tempDir, "prompt.txt");
    const mdPath = join(tempDir, "prompt.md");
    const strategyPath = join(tempDir, "strategy.json");

    await writeFile(txtPath, "Hello from text file!");
    await writeFile(mdPath, "Hello from markdown file!");

    const strategyJson = `{
      "name": "File Prompt Strategy",
      "version": "1.0",
      "agents": {
        "textAgent": {
          "model": "openai/gpt-4o",
          "systemPrompt": "./prompt.txt"
        },
        "mdAgent": {
          "model": "openai/gpt-4o",
          "systemPrompt": "./prompt.md"
        }
      },
      "flow": {
        "name": "MultiStep",
        "type": "sequential",
        "steps": [
          { "agent": "textAgent" },
          { "agent": "mdAgent" }
        ]
      }
    }`;

    await writeFile(strategyPath, strategyJson);

    try {
      const result = await loadStrategy(strategyPath);
      expect(result.name).toBe("File Prompt Strategy");

      const textAgentPrompt = result.agents.textAgent.config?.systemPrompt;
      const mdAgentPrompt = result.agents.mdAgent.config?.systemPrompt;

      expect(textAgentPrompt).toBe("Hello from text file!");
      expect(mdAgentPrompt).toBe("Hello from markdown file!");
    } finally {
      // Clean up
      await unlink(txtPath).catch(() => {});
      await unlink(mdPath).catch(() => {});
      await unlink(strategyPath).catch(() => {});
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("should throw StrategyValidationError for missing systemPrompt file", async () => {
    setupMockModels();
    const tempDir = resolve(__dirname, "test_temp_missing");
    await mkdir(tempDir, { recursive: true });

    const strategyPath = join(tempDir, "strategy_missing.json");
    const strategyJson = `{
      "name": "Missing Prompt Strategy",
      "version": "1.0",
      "agents": {
        "brokenAgent": {
          "model": "openai/gpt-4o",
          "systemPrompt": "./nonexistent_prompt.txt"
        }
      },
      "flow": {
        "name": "SingleStep",
        "type": "sequential",
        "steps": [
          { "agent": "brokenAgent" }
        ]
      }
    }`;

    await writeFile(strategyPath, strategyJson);

    try {
      await expect(loadStrategy(strategyPath)).rejects.toThrow(
        StrategyValidationError,
      );
    } finally {
      await unlink(strategyPath).catch(() => {});
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("should support JSONC in loadProject", async () => {
    const tempDir = resolve(__dirname, "test_temp_project");
    await mkdir(tempDir, { recursive: true });

    const manifestPath = join(tempDir, "comma-project.json");
    const manifestJson = `{
      // This is a JSONC project manifest
      "name": "JSONC Project",
      "version": "1.0",
      "strategies": [
        "./strategy.json"
      ]
    }`;

    await writeFile(manifestPath, manifestJson);

    try {
      const result = await loadProject(manifestPath);
      expect(result.name).toBe("JSONC Project");
    } finally {
      await unlink(manifestPath).catch(() => {});
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
