// Tests for flow loader — parse, validate, and instantiate flows.

import { describe, expect, it } from "bun:test";
import { StrategyValidationError } from "../../errors/index";
import { makeAgent, makeCountingAgent } from "../test.utils";
import { loadFlow, loadFlowFromString } from "./loader";
import { FlowDescriptionSchema } from "./loader.schema";
import type { LoadFlowOptions } from "./loader.types";

// Mock agents used across tests

/** Create a standard agent registry for tests. */
function createTestAgentRegistry(): LoadFlowOptions {
  return {
    agents: {
      writer: makeAgent("writer", (message) => `written: ${message}`),
      reviewer: makeAgent("reviewer", (message) => `reviewed: ${message}`),
      editor: makeAgent("editor", (message) => `edited: ${message}`),
    },
  };
}

// Minimal description strings

const MINIMAL_SEQUENTIAL_JSON = JSON.stringify({
  name: "pipeline",
  type: "sequential",
  steps: [{ agent: "writer" }, { agent: "reviewer" }],
});

const MINIMAL_SEQUENTIAL_YAML = `
name: pipeline
type: sequential
steps:
  - agent: writer
  - agent: reviewer
`;

const FULL_SEQUENTIAL_JSON = JSON.stringify({
  name: "code-review",
  type: "sequential",
  description: "A code review pipeline",
  steps: [{ agent: "writer" }, { agent: "reviewer" }, { agent: "editor" }],
});

const CYCLE_JSON = JSON.stringify({
  name: "review-loop",
  type: "cycle",
  steps: [{ agent: "writer" }, { agent: "reviewer" }],
  cycles: 3,
});

const CYCLE_WITH_OBSERVER_JSON = JSON.stringify({
  name: "observed-loop",
  type: "cycle",
  steps: [{ agent: "writer" }],
  cycles: 2,
  observer: "reviewer",
});

const CYCLE_INFINITY_JSON = JSON.stringify({
  name: "infinite-loop",
  type: "cycle",
  steps: [{ agent: "writer" }],
  cycles: "Infinity",
});

const BROADCAST_JSON = JSON.stringify({
  name: "multi-review",
  type: "broadcast",
  steps: [{ agent: "writer" }, { agent: "reviewer" }],
});

const BROADCAST_WITH_SEPARATOR_JSON = JSON.stringify({
  name: "multi-review",
  type: "broadcast",
  steps: [{ agent: "writer" }, { agent: "reviewer" }],
  separator: "\n---\n",
});

const NESTED_FLOW_JSON = JSON.stringify({
  name: "outer",
  type: "sequential",
  steps: [
    { agent: "writer" },
    {
      name: "inner-review",
      type: "sequential",
      steps: [{ agent: "reviewer" }, { agent: "editor" }],
    },
  ],
});

// -- Schema tests --

describe("FlowDescriptionSchema", () => {
  it("should accept a minimal sequential flow", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "pipeline",
      type: "sequential",
      steps: [{ agent: "writer" }],
    });
    expect(result.success).toBe(true);
  });

  it("should accept a full sequential flow with description", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "pipeline",
      type: "sequential",
      description: "A review pipeline",
      steps: [{ agent: "writer" }, { agent: "reviewer" }],
    });
    expect(result.success).toBe(true);
  });

  it("should accept a cycle flow with cycles count", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "loop",
      type: "cycle",
      steps: [{ agent: "writer" }],
      cycles: 3,
    });
    expect(result.success).toBe(true);
  });

  it("should accept a cycle flow with Infinity string", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "loop",
      type: "cycle",
      steps: [{ agent: "writer" }],
      cycles: "Infinity",
    });
    expect(result.success).toBe(true);
  });

  it("should accept a cycle flow with observer", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "loop",
      type: "cycle",
      steps: [{ agent: "writer" }],
      observer: "critic",
    });
    expect(result.success).toBe(true);
  });

  it("should accept a broadcast flow", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "fanout",
      type: "broadcast",
      steps: [{ agent: "writer" }, { agent: "reviewer" }],
    });
    expect(result.success).toBe(true);
  });

  it("should accept a broadcast flow with separator", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "fanout",
      type: "broadcast",
      steps: [{ agent: "writer" }],
      separator: "---",
    });
    expect(result.success).toBe(true);
  });

  it("should accept nested flow definitions", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "outer",
      type: "sequential",
      steps: [
        { agent: "writer" },
        {
          name: "inner",
          type: "sequential",
          steps: [{ agent: "reviewer" }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "",
      type: "sequential",
      steps: [{ agent: "writer" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing name", () => {
    const result = FlowDescriptionSchema.safeParse({
      type: "sequential",
      steps: [{ agent: "writer" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing type", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "test",
      steps: [{ agent: "writer" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty steps array", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "test",
      type: "sequential",
      steps: [],
    });
    expect(result.success).toBe(false);
  });

  it("should reject missing steps", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "test",
      type: "sequential",
    });
    expect(result.success).toBe(false);
  });

  it("should reject unknown type", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "test",
      type: "parallel",
      steps: [{ agent: "writer" }],
    });
    expect(result.success).toBe(false);
  });

  it("should reject unknown fields (strict mode)", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "test",
      type: "sequential",
      steps: [{ agent: "writer" }],
      unknownField: true,
    });
    expect(result.success).toBe(false);
  });

  it("should reject non-positive cycles", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "loop",
      type: "cycle",
      steps: [{ agent: "writer" }],
      cycles: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative cycles", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "loop",
      type: "cycle",
      steps: [{ agent: "writer" }],
      cycles: -1,
    });
    expect(result.success).toBe(false);
  });

  it("should reject separator on sequential flow (strict mode)", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "test",
      type: "sequential",
      steps: [{ agent: "writer" }],
      separator: "---",
    });
    expect(result.success).toBe(false);
  });

  it("should reject cycles on sequential flow (strict mode)", () => {
    const result = FlowDescriptionSchema.safeParse({
      name: "test",
      type: "sequential",
      steps: [{ agent: "writer" }],
      cycles: 3,
    });
    expect(result.success).toBe(false);
  });
});

// -- loadFlowFromString tests --

describe("loadFlowFromString", () => {
  describe("parsing", () => {
    it("should parse a minimal sequential JSON description", () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(MINIMAL_SEQUENTIAL_JSON, "json", options);
      expect(flow.name).toBe("pipeline");
    });

    it("should parse a minimal sequential YAML description", () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(MINIMAL_SEQUENTIAL_YAML, "yaml", options);
      expect(flow.name).toBe("pipeline");
    });

    it("should parse a full JSON description with all fields", () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(FULL_SEQUENTIAL_JSON, "json", options);
      expect(flow.name).toBe("code-review");
    });

    it("should throw on invalid JSON", () => {
      const options = createTestAgentRegistry();
      expect(() => loadFlowFromString("not json{}", "json", options)).toThrow(
        StrategyValidationError,
      );
    });

    it("should throw on invalid YAML", () => {
      const options = createTestAgentRegistry();
      expect(() =>
        loadFlowFromString(":\n  - :\n    :", "yaml", options),
      ).toThrow(StrategyValidationError);
    });
  });

  describe("validation", () => {
    it("should throw on missing name", () => {
      const json = JSON.stringify({
        type: "sequential",
        steps: [{ agent: "writer" }],
      });
      const options = createTestAgentRegistry();
      expect(() => loadFlowFromString(json, "json", options)).toThrow(
        StrategyValidationError,
      );
    });

    it("should throw on missing type", () => {
      const json = JSON.stringify({
        name: "test",
        steps: [{ agent: "writer" }],
      });
      const options = createTestAgentRegistry();
      expect(() => loadFlowFromString(json, "json", options)).toThrow(
        StrategyValidationError,
      );
    });

    it("should throw on missing steps", () => {
      const json = JSON.stringify({ name: "test", type: "sequential" });
      const options = createTestAgentRegistry();
      expect(() => loadFlowFromString(json, "json", options)).toThrow(
        StrategyValidationError,
      );
    });

    it("should throw on unknown fields", () => {
      const json = JSON.stringify({
        name: "test",
        type: "sequential",
        steps: [{ agent: "writer" }],
        unknownField: true,
      });
      const options = createTestAgentRegistry();
      expect(() => loadFlowFromString(json, "json", options)).toThrow(
        StrategyValidationError,
      );
    });

    it("should include validation issue details in error message", () => {
      const json = JSON.stringify({
        type: "sequential",
        steps: [{ agent: "writer" }],
      });
      const options = createTestAgentRegistry();
      try {
        loadFlowFromString(json, "json", options);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(StrategyValidationError);
        expect((error as StrategyValidationError).message).toContain(
          "validation failed",
        );
      }
    });
  });

  describe("agent resolution", () => {
    it("should resolve agent steps from the provided registry", async () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(MINIMAL_SEQUENTIAL_JSON, "json", options);
      const result = await flow.call("hello");
      // Sequential: writer then reviewer
      expect(result.text).toBe("reviewed: written: hello");
    });

    it("should throw when an agent reference is not in the registry", () => {
      const options: LoadFlowOptions = { agents: {} };
      expect(() =>
        loadFlowFromString(MINIMAL_SEQUENTIAL_JSON, "json", options),
      ).toThrow(StrategyValidationError);
    });

    it("should include available agent names in error for missing reference", () => {
      const options: LoadFlowOptions = {
        agents: { writer: makeAgent("writer", "ok") },
      };
      const json = JSON.stringify({
        name: "test",
        type: "sequential",
        steps: [{ agent: "writer" }, { agent: "missing-agent" }],
      });
      try {
        loadFlowFromString(json, "json", options);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(StrategyValidationError);
        expect((error as StrategyValidationError).message).toContain(
          "missing-agent",
        );
        expect((error as StrategyValidationError).message).toContain("writer");
      }
    });
  });

  describe("sequential flow", () => {
    it("should create a sequential flow that chains agent outputs", async () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(MINIMAL_SEQUENTIAL_JSON, "json", options);
      const result = await flow.call("input");
      // writer wraps with "written: " then reviewer wraps with "reviewed: "
      expect(result.text).toBe("reviewed: written: input");
    });

    it("should chain three agents in a full sequential flow", async () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(FULL_SEQUENTIAL_JSON, "json", options);
      const result = await flow.call("code");
      expect(result.text).toBe("edited: reviewed: written: code");
    });
  });

  describe("cycle flow", () => {
    it("should create a cycle flow with specified cycles", async () => {
      const { agent: writer, getCount: getWriterCount } =
        makeCountingAgent("writer");
      const { agent: reviewer, getCount: getReviewerCount } =
        makeCountingAgent("reviewer");
      const options: LoadFlowOptions = { agents: { writer, reviewer } };
      const flow = loadFlowFromString(CYCLE_JSON, "json", options);
      await flow.call("start");
      // 3 cycles * 2 steps = 6 total calls (3 each)
      expect(getWriterCount()).toBe(3);
      expect(getReviewerCount()).toBe(3);
    });

    it("should resolve observer agent for cycle flows", async () => {
      const { agent: writer, getCount: getWriterCount } =
        makeCountingAgent("writer");
      const { agent: reviewer, getCount: getReviewerCount } =
        makeCountingAgent("reviewer");
      const options: LoadFlowOptions = { agents: { writer, reviewer } };
      const flow = loadFlowFromString(
        CYCLE_WITH_OBSERVER_JSON,
        "json",
        options,
      );
      await flow.call("start");
      // 2 cycles with 1 step each, observer runs after each cycle
      expect(getWriterCount()).toBe(2);
      expect(getReviewerCount()).toBe(2);
    });

    it("should parse Infinity string as infinite cycles", () => {
      const options = createTestAgentRegistry();
      // Just verify it creates without error — we won't actually run infinite cycles
      const flow = loadFlowFromString(CYCLE_INFINITY_JSON, "json", options);
      expect(flow.name).toBe("infinite-loop");
    });

    it("should default to 1 cycle when cycles is omitted", async () => {
      const { agent: writer, getCount } = makeCountingAgent("writer");
      const json = JSON.stringify({
        name: "single-cycle",
        type: "cycle",
        steps: [{ agent: "writer" }],
      });
      const options: LoadFlowOptions = { agents: { writer } };
      const flow = loadFlowFromString(json, "json", options);
      await flow.call("input");
      expect(getCount()).toBe(1);
    });
  });

  describe("broadcast flow", () => {
    it("should create a broadcast flow that sends message to all steps", async () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(BROADCAST_JSON, "json", options);
      const result = await flow.call("input");
      // Both agents receive "input", results joined with default separator
      expect(result.text).toContain("written: input");
      expect(result.text).toContain("reviewed: input");
    });

    it("should use custom separator for broadcast flow", async () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(
        BROADCAST_WITH_SEPARATOR_JSON,
        "json",
        options,
      );
      const result = await flow.call("input");
      expect(result.text).toBe("written: input\n---\nreviewed: input");
    });
  });

  describe("nested flows", () => {
    it("should build nested flow definitions recursively", async () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(NESTED_FLOW_JSON, "json", options);
      const result = await flow.call("hello");
      // Outer sequential: writer then inner sequential (reviewer then editor)
      expect(result.text).toBe("edited: reviewed: written: hello");
    });
  });

  describe("flow lifecycle", () => {
    it("should return a flow with call and reset methods", () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(MINIMAL_SEQUENTIAL_JSON, "json", options);
      expect(typeof flow.call).toBe("function");
      expect(typeof flow.reset).toBe("function");
    });

    it("should return a flow with name matching the description", () => {
      const options = createTestAgentRegistry();
      const flow = loadFlowFromString(MINIMAL_SEQUENTIAL_JSON, "json", options);
      expect(flow.name).toBe("pipeline");
    });
  });

  describe("flow hooks injection", () => {
    it("should inject flow hooks when provided in options", async () => {
      const capturedMessages: string[] = [];
      const options: LoadFlowOptions = {
        ...createTestAgentRegistry(),
        flowHooks: {
          beforeFlow: [
            async (message: string) => {
              capturedMessages.push(message);
            },
          ],
        },
      };
      const flow = loadFlowFromString(MINIMAL_SEQUENTIAL_JSON, "json", options);
      await flow.call("test-message");
      expect(capturedMessages).toEqual(["test-message"]);
    });
  });
});

// -- loadFlow file-based tests --

describe("loadFlow", () => {
  it("should throw on unsupported file extension", async () => {
    const options = createTestAgentRegistry();
    await expect(loadFlow("test.txt", options)).rejects.toThrow(
      StrategyValidationError,
    );
  });

  it("should throw on missing file", async () => {
    const options = createTestAgentRegistry();
    await expect(loadFlow("nonexistent.yaml", options)).rejects.toThrow(
      StrategyValidationError,
    );
  });

  it("should include file extension in error message for unsupported types", async () => {
    const options = createTestAgentRegistry();
    try {
      await loadFlow("test.xml", options);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StrategyValidationError);
      expect((error as StrategyValidationError).message).toContain(".xml");
    }
  });

  it("should include file path in error message for missing files", async () => {
    const options = createTestAgentRegistry();
    try {
      await loadFlow("missing-flow.yaml", options);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StrategyValidationError);
      expect((error as StrategyValidationError).message).toContain(
        "missing-flow.yaml",
      );
    }
  });
});
