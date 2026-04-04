// Tests for strategy/exporter.ts — round-trip serialization

import { afterEach, describe, expect, it } from "bun:test";
import YAML from "yaml";
import { registerModel, resetModelRegistry } from "../../model/model";
import { loadStrategyFromString } from "../loader/loader";
import { StrategySchema } from "../schema";
import { exportStrategy } from "./exporter";

// Mock model registration

/** Register a mock model for a given model string in the global registry. */
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
  registerMockModel("anthropic/claude-sonnet-4-5");
}

// Cleanup

afterEach(() => {
  resetModelRegistry();
});

// Test strategies

const MINIMAL_STRATEGY = {
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

const COMPLEX_STRATEGY = {
  name: "Code Review",
  version: "2.0",
  description: "Multi-agent review pipeline",
  agents: {
    user: {
      type: "user" as const,
      description: "Collects input",
      config: { requireInput: false, presetMessage: "Review this." },
    },
    writer: {
      model: "openai/gpt-4o",
      systemPrompt: "You write code.",
      tools: ["bash", "write", "edit"],
    },
    reviewer: {
      model: "anthropic/claude-sonnet-4-5",
      systemPrompt: "You review code.",
    },
  },
  flow: {
    name: "Pipeline",
    type: "sequential" as const,
    steps: [
      { agent: "user" },
      { agent: "writer" },
      {
        name: "Review Loop",
        type: "cycle" as const,
        cycles: 3,
        observer: "reviewer",
        steps: [{ agent: "writer" }],
      },
    ],
  },
};

// Tests

describe("exportStrategy", () => {
  describe("JSON export", () => {
    it("exports a minimal strategy as valid JSON", async () => {
      setupMockModels();
      const loaded = await loadStrategyFromString(JSON.stringify(MINIMAL_STRATEGY), "json");

      const json = exportStrategy(loaded);
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe("Test");
      expect(parsed.version).toBe("1.0");
      expect(parsed.agents.assistant).toBeDefined();
      expect(parsed.flow.type).toBe("sequential");
    });

    it("exports a complex strategy as valid JSON", async () => {
      setupMockModels();
      const loaded = await loadStrategyFromString(JSON.stringify(COMPLEX_STRATEGY), "json");

      const json = exportStrategy(loaded);
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe("Code Review");
      expect(parsed.description).toBe("Multi-agent review pipeline");
      expect(parsed.agents.user.type).toBe("user");
      expect(parsed.agents.writer.tools).toEqual(["bash", "write", "edit"]);
    });

    it("uses default format (JSON) when no format specified", async () => {
      setupMockModels();
      const loaded = await loadStrategyFromString(JSON.stringify(MINIMAL_STRATEGY), "json");

      const output = exportStrategy(loaded);
      // Should be valid JSON
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("respects custom indent", async () => {
      setupMockModels();
      const loaded = await loadStrategyFromString(JSON.stringify(MINIMAL_STRATEGY), "json");

      const json4 = exportStrategy(loaded, { indent: 4 });
      const json2 = exportStrategy(loaded, { indent: 2 });

      // Both are valid JSON
      expect(() => JSON.parse(json4)).not.toThrow();
      expect(() => JSON.parse(json2)).not.toThrow();

      // 4-space indent produces a longer string than 2-space for the same content
      expect(json4.length).toBeGreaterThan(json2.length);
    });
  });

  describe("YAML export", () => {
    it("exports a strategy as valid YAML", async () => {
      setupMockModels();
      const loaded = await loadStrategyFromString(JSON.stringify(MINIMAL_STRATEGY), "json");

      const yamlStr = exportStrategy(loaded, { format: "yaml" });
      const parsed = YAML.parse(yamlStr);

      expect(parsed.name).toBe("Test");
      expect(parsed.version).toBe("1.0");
      expect(parsed.agents.assistant).toBeDefined();
    });

    it("exports a complex strategy as valid YAML", async () => {
      setupMockModels();
      const loaded = await loadStrategyFromString(JSON.stringify(COMPLEX_STRATEGY), "json");

      const yamlStr = exportStrategy(loaded, { format: "yaml" });
      const parsed = YAML.parse(yamlStr);

      expect(parsed.name).toBe("Code Review");
      expect(parsed.agents.writer.tools).toEqual(["bash", "write", "edit"]);
    });
  });

  describe("round-trip fidelity", () => {
    it("JSON -> load -> export -> validates against schema", async () => {
      setupMockModels();
      const original = JSON.stringify(COMPLEX_STRATEGY);
      const loaded = await loadStrategyFromString(original, "json");
      const exported = exportStrategy(loaded);
      const reparsed = JSON.parse(exported);

      const result = StrategySchema.safeParse(reparsed);
      expect(result.success).toBe(true);
    });

    it("JSON -> load -> export JSON -> load again produces same structure", async () => {
      setupMockModels();
      const original = JSON.stringify(COMPLEX_STRATEGY);
      const loaded1 = await loadStrategyFromString(original, "json");
      const exported = exportStrategy(loaded1);
      const loaded2 = await loadStrategyFromString(exported, "json");

      expect(loaded2.name).toBe(loaded1.name);
      expect(loaded2.version).toBe(loaded1.version);
      expect(loaded2.description).toBe(loaded1.description);
      expect(Object.keys(loaded2.agents)).toEqual(Object.keys(loaded1.agents));
      expect(loaded2.flow.name).toBe(loaded1.flow.name);
    });

    it("JSON -> load -> export YAML -> load produces same structure", async () => {
      setupMockModels();
      const original = JSON.stringify(COMPLEX_STRATEGY);
      const loaded1 = await loadStrategyFromString(original, "json");
      const yamlStr = exportStrategy(loaded1, { format: "yaml" });
      const loaded2 = await loadStrategyFromString(yamlStr, "yaml");

      expect(loaded2.name).toBe(loaded1.name);
      expect(loaded2.version).toBe(loaded1.version);
      expect(Object.keys(loaded2.agents)).toEqual(Object.keys(loaded1.agents));
      expect(loaded2.flow.name).toBe(loaded1.flow.name);
    });

    it("YAML -> load -> export JSON -> validates", async () => {
      setupMockModels();
      const yaml = `
name: YAML Test
version: "1.0"
agents:
  assistant:
    model: openai/gpt-4o
    systemPrompt: Be helpful.
flow:
  name: Main
  type: sequential
  steps:
    - agent: assistant
`;
      const loaded = await loadStrategyFromString(yaml, "yaml");
      const json = exportStrategy(loaded, { format: "json" });
      const reparsed = JSON.parse(json);

      const result = StrategySchema.safeParse(reparsed);
      expect(result.success).toBe(true);
    });

    it("preserves nested flow structures through round-trip", async () => {
      setupMockModels();
      const strategy = {
        name: "Nested",
        version: "1.0",
        agents: {
          a: { model: "openai/gpt-4o" },
          b: { model: "openai/gpt-4o" },
        },
        flow: {
          name: "Outer",
          type: "sequential" as const,
          steps: [
            { agent: "a" },
            {
              name: "Inner",
              type: "cycle" as const,
              cycles: 3,
              steps: [{ agent: "b" }],
            },
          ],
        },
      };

      const loaded = await loadStrategyFromString(JSON.stringify(strategy), "json");
      const exported = exportStrategy(loaded);
      const reparsed = JSON.parse(exported);

      expect(reparsed.flow.steps).toHaveLength(2);
      expect(reparsed.flow.steps[0].agent).toBe("a");
      expect(reparsed.flow.steps[1].name).toBe("Inner");
      expect(reparsed.flow.steps[1].type).toBe("cycle");
      expect(reparsed.flow.steps[1].cycles).toBe(3);
    });
  });
});
