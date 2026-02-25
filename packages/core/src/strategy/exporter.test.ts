// Tests for strategy/exporter.ts — round-trip serialization

import { describe, expect, it } from "bun:test";
import type { LanguageModel } from "ai";
import YAML from "yaml";
import { exportStrategy } from "./exporter";
import type { LoadStrategyOptions, ProviderFactory } from "./loader";
import { loadStrategyFromString } from "./loader";
import { StrategySchema } from "./schema";

// ---------------------------------------------------------------------------
// Mock provider
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

function defaultOptions(): LoadStrategyOptions {
  return {
    providers: {
      openai: (id) => createMockModel(`openai/${id}`),
      anthropic: (id) => createMockModel(`anthropic/${id}`),
    },
  };
}

// ---------------------------------------------------------------------------
// Test strategies
// ---------------------------------------------------------------------------

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
  defaults: {
    model: "openai/gpt-4o",
    tools: ["bash", "read"],
    systemPrompt: "Be helpful.",
  },
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
      useDefaults: true,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("exportStrategy", () => {
  describe("JSON export", () => {
    it("exports a minimal strategy as valid JSON", () => {
      const loaded = loadStrategyFromString(
        JSON.stringify(MINIMAL_STRATEGY),
        "json",
        defaultOptions(),
      );

      const json = exportStrategy(loaded);
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe("Test");
      expect(parsed.version).toBe("1.0");
      expect(parsed.agents.assistant).toBeDefined();
      expect(parsed.flow.type).toBe("sequential");
    });

    it("exports a complex strategy as valid JSON", () => {
      const loaded = loadStrategyFromString(
        JSON.stringify(COMPLEX_STRATEGY),
        "json",
        defaultOptions(),
      );

      const json = exportStrategy(loaded);
      const parsed = JSON.parse(json);

      expect(parsed.name).toBe("Code Review");
      expect(parsed.description).toBe("Multi-agent review pipeline");
      expect(parsed.defaults?.model).toBe("openai/gpt-4o");
      expect(parsed.agents.user.type).toBe("user");
      expect(parsed.agents.writer.tools).toEqual(["bash", "write", "edit"]);
    });

    it("uses default format (JSON) when no format specified", () => {
      const loaded = loadStrategyFromString(
        JSON.stringify(MINIMAL_STRATEGY),
        "json",
        defaultOptions(),
      );

      const output = exportStrategy(loaded);
      // Should be valid JSON
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("respects custom indent", () => {
      const loaded = loadStrategyFromString(
        JSON.stringify(MINIMAL_STRATEGY),
        "json",
        defaultOptions(),
      );

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
    it("exports a strategy as valid YAML", () => {
      const loaded = loadStrategyFromString(
        JSON.stringify(MINIMAL_STRATEGY),
        "json",
        defaultOptions(),
      );

      const yamlStr = exportStrategy(loaded, { format: "yaml" });
      const parsed = YAML.parse(yamlStr);

      expect(parsed.name).toBe("Test");
      expect(parsed.version).toBe("1.0");
      expect(parsed.agents.assistant).toBeDefined();
    });

    it("exports a complex strategy as valid YAML", () => {
      const loaded = loadStrategyFromString(
        JSON.stringify(COMPLEX_STRATEGY),
        "json",
        defaultOptions(),
      );

      const yamlStr = exportStrategy(loaded, { format: "yaml" });
      const parsed = YAML.parse(yamlStr);

      expect(parsed.name).toBe("Code Review");
      expect(parsed.defaults.tools).toEqual(["bash", "read"]);
    });
  });

  describe("round-trip fidelity", () => {
    it("JSON -> load -> export -> validates against schema", () => {
      const original = JSON.stringify(COMPLEX_STRATEGY);
      const loaded = loadStrategyFromString(original, "json", defaultOptions());
      const exported = exportStrategy(loaded);
      const reparsed = JSON.parse(exported);

      const result = StrategySchema.safeParse(reparsed);
      expect(result.success).toBe(true);
    });

    it("JSON -> load -> export JSON -> load again produces same structure", () => {
      const original = JSON.stringify(COMPLEX_STRATEGY);
      const loaded1 = loadStrategyFromString(original, "json", defaultOptions());
      const exported = exportStrategy(loaded1);
      const loaded2 = loadStrategyFromString(exported, "json", defaultOptions());

      expect(loaded2.name).toBe(loaded1.name);
      expect(loaded2.version).toBe(loaded1.version);
      expect(loaded2.description).toBe(loaded1.description);
      expect(Object.keys(loaded2.agents)).toEqual(Object.keys(loaded1.agents));
      expect(loaded2.flow.name).toBe(loaded1.flow.name);
    });

    it("JSON -> load -> export YAML -> load produces same structure", () => {
      const original = JSON.stringify(COMPLEX_STRATEGY);
      const loaded1 = loadStrategyFromString(original, "json", defaultOptions());
      const yamlStr = exportStrategy(loaded1, { format: "yaml" });
      const loaded2 = loadStrategyFromString(yamlStr, "yaml", defaultOptions());

      expect(loaded2.name).toBe(loaded1.name);
      expect(loaded2.version).toBe(loaded1.version);
      expect(Object.keys(loaded2.agents)).toEqual(Object.keys(loaded1.agents));
      expect(loaded2.flow.name).toBe(loaded1.flow.name);
    });

    it("YAML -> load -> export JSON -> validates", () => {
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
      const loaded = loadStrategyFromString(yaml, "yaml", defaultOptions());
      const json = exportStrategy(loaded, { format: "json" });
      const reparsed = JSON.parse(json);

      const result = StrategySchema.safeParse(reparsed);
      expect(result.success).toBe(true);
    });

    it("preserves nested flow structures through round-trip", () => {
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

      const loaded = loadStrategyFromString(JSON.stringify(strategy), "json", defaultOptions());
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
