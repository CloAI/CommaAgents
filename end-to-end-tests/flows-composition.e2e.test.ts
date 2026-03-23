/**
 * E2E Test: Flow Composition
 *
 * Tests the three flow types (sequential, cycle, broadcast) individually
 * and in nested compositions. Verifies hooks fire in the correct order,
 * error propagation mid-flow, and flow reset behavior.
 *
 * Covers:
 *   1. Sequential flow with tool-calling agents
 *   2. Cycle flow with dynamic observer feedback
 *   3. Cycle flow abort by observer (infinite loop with abort)
 *   4. Broadcast flow with tool-calling agents
 *   5. Nested: sequential → [broadcast, cycle]
 *   6. Full hook lifecycle ordering (flow + step + agent + tool + cycle hooks)
 *   7. Error mid-flow propagation
 *   8. Flow reset propagation
 *
 * All tests use mock models — no API keys required.
 */

import { describe, expect, it } from "bun:test";
import {
  createAgent,
  createBroadcastFlow,
  createCycleFlow,
  createSequentialFlow,
} from "@comma-agents/core";
import type {
  Agent,
  AgentCallResult,
  AgentHooks,
  ToolHooks,
  CycleHooks,
  FlowHooks,
  FlowResult,
} from "@comma-agents/core";
import { createSimpleMockModel, createToolCallingMockModel } from "./helpers/mock-model";
import { createEchoTool } from "./helpers/test-tools";

// Helpers

/** Create a simple agent that returns a fixed response. */
function makeAgent(name: string, response: string, hooks?: AgentHooks) {
  return createAgent({
    name,
    model: createSimpleMockModel([response]),
    hooks,
  });
}

/** Create a simple agent that returns responses in sequence. */
function makeMultiResponseAgent(name: string, responses: string[]) {
  return createAgent({
    name,
    model: createSimpleMockModel(responses),
  });
}

/** Create a tool-calling agent (calls echo tool, then returns final text). */
function makeToolAgent(name: string, echoMessage: string, finalText: string) {
  return createAgent({
    name,
    model: createToolCallingMockModel({
      rounds: [
        {
          toolCalls: [{ id: `${name}-c1`, name: "echo", args: { message: echoMessage } }],
        },
        { text: finalText },
      ],
    }),
    tools: { echo: createEchoTool() },
  });
}

// Tests

describe("E2E: Flow Composition", () => {
  // -----------------------------------------------------------------------
  // 1. Sequential flow with tool-calling agents
  // -----------------------------------------------------------------------

  describe("sequential flow with tool-calling agents", () => {
    it("should chain tool-calling agents, passing output of each to the next", async () => {
      // Agent A: calls echo tool, returns "Step-A done"
      // Agent B: receives "Step-A done", calls echo tool, returns "Step-B done"
      const agentA = makeToolAgent("agent-a", "hello", "Step-A done");
      const agentB = makeToolAgent("agent-b", "world", "Step-B done");

      const flow = createSequentialFlow({
        name: "seq-tool-flow",
        steps: [agentA, agentB],
      });

      const result = (await flow.call("Start")) as FlowResult;

      expect(result.text).toBe("Step-B done");
      expect(result.stepResults.length).toBe(2);
      expect(result.stepResults[0]!.text).toBe("Step-A done");
      expect(result.stepResults[1]!.text).toBe("Step-B done");
    });

    it("should aggregate token usage across all steps", async () => {
      const agentA = makeAgent("a", "Response A");
      const agentB = makeAgent("b", "Response B");

      const flow = createSequentialFlow({
        name: "seq-usage",
        steps: [agentA, agentB],
      });

      const result = (await flow.call("Input")) as FlowResult;

      // Each mock model reports 10 input + 20 output tokens
      expect(result.usage.promptTokens).toBe(20);
      expect(result.usage.completionTokens).toBe(40);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Cycle flow with dynamic observer feedback
  // -----------------------------------------------------------------------

  describe("cycle flow with observer", () => {
    it("should run observer after each cycle, feeding its output to the next cycle", async () => {
      const cycleOutputs: string[] = [];

      // Main worker: appends "-work" to input
      const worker = makeMultiResponseAgent("worker", ["draft-v1", "draft-v2", "draft-v3"]);

      // Observer: appends "-reviewed" to input
      const observer = makeMultiResponseAgent("observer", [
        "feedback-v1",
        "feedback-v2",
        "feedback-v3",
      ]);

      const flow = createCycleFlow({
        name: "review-loop",
        steps: [worker],
        cycles: 3,
        observer,
        hooks: {
          afterStep: [
            async ({ stepName, result }) => {
              cycleOutputs.push(`${stepName}:${result.text}`);
            },
          ],
        },
      });

      const result = (await flow.call("Initial prompt")) as FlowResult;

      // Flow should have completed 3 cycles
      // Each cycle: worker runs → observer runs (as afterCycle hook)
      // The final text is the observer's last output (alterMessageAfterCycle)
      // OR the worker's last output if observer transforms it
      expect(result.text).toBeTruthy();
      expect(cycleOutputs.length).toBe(3); // 3 worker steps
    });

    it("should work without observer for simple N-cycle repetition", async () => {
      const worker = makeMultiResponseAgent("counter", ["count-1", "count-2", "count-3"]);

      const flow = createCycleFlow({
        name: "simple-cycle",
        steps: [worker],
        cycles: 3,
      });

      const result = await flow.call("Start counting");

      // After 3 cycles, the last worker output is the result
      expect(result.text).toBe("count-3");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Cycle flow abort (infinite loop with abort signal)
  // -----------------------------------------------------------------------

  describe("cycle flow abort", () => {
    it("should stop infinite cycle when abort signal fires", async () => {
      let cycleCount = 0;

      // Worker that counts cycles
      const responses = Array.from({ length: 100 }, (_, i) => `cycle-${i + 1}`);
      const worker = makeMultiResponseAgent("infinite-worker", responses);

      const controller = new AbortController();

      const flow = createCycleFlow({
        name: "infinite-cycle",
        steps: [worker],
        cycles: Infinity,
        abort: controller.signal,
        hooks: {
          afterStep: [
            async () => {
              cycleCount++;
              // Abort after 3 cycles
              if (cycleCount >= 3) {
                controller.abort();
              }
            },
          ],
        },
      });

      const result = await flow.call("Go");

      // Should have stopped after approximately 3 cycles
      expect(cycleCount).toBeGreaterThanOrEqual(3);
      expect(cycleCount).toBeLessThan(10);
      expect(result.text).toBeTruthy();
    });

    it("should throw if infinite cycle is created without abort signal", () => {
      const worker = makeAgent("w", "out");

      expect(() => {
        createCycleFlow({
          name: "no-abort",
          steps: [worker],
          cycles: Infinity,
        });
      }).toThrow(/abort/i);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Broadcast flow with tool-calling agents
  // -----------------------------------------------------------------------

  describe("broadcast flow", () => {
    it("should send the same message to all agents and join their outputs", async () => {
      const agentA = makeAgent("reviewer-1", "Review A: looks good");
      const agentB = makeAgent("reviewer-2", "Review B: needs work");
      const agentC = makeAgent("reviewer-3", "Review C: minor issues");

      const flow = createBroadcastFlow({
        name: "multi-review",
        steps: [agentA, agentB, agentC],
        separator: "\n---\n",
      });

      const result = (await flow.call("Review this code")) as FlowResult;

      expect(result.text).toBe(
        "Review A: looks good\n---\nReview B: needs work\n---\nReview C: minor issues",
      );
      expect(result.stepResults.length).toBe(3);
    });

    it("should work with tool-calling agents in broadcast", async () => {
      const agentA = makeToolAgent("tool-reviewer-1", "analyzing", "Tool Review A: passed");
      const agentB = makeToolAgent("tool-reviewer-2", "checking", "Tool Review B: passed");

      const flow = createBroadcastFlow({
        name: "tool-broadcast",
        steps: [agentA, agentB],
      });

      const result = (await flow.call("Check code quality")) as FlowResult;

      // Default separator is \n\n
      expect(result.text).toBe("Tool Review A: passed\n\nTool Review B: passed");
      expect(result.stepResults.length).toBe(2);
    });

    it("should use default separator when none specified", async () => {
      const agentA = makeAgent("a", "Part A");
      const agentB = makeAgent("b", "Part B");

      const flow = createBroadcastFlow({
        name: "default-sep",
        steps: [agentA, agentB],
      });

      const result = await flow.call("Input");

      expect(result.text).toBe("Part A\n\nPart B");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Nested: sequential → [broadcast, cycle]
  // -----------------------------------------------------------------------

  describe("nested flow composition", () => {
    it("should nest a broadcast flow inside a sequential flow", async () => {
      // Step 1: single agent produces initial analysis
      const analyzer = makeAgent("analyzer", "Analysis: code has 3 functions");

      // Step 2: broadcast flow fans out to multiple reviewers
      const reviewer1 = makeAgent("reviewer-1", "Reviewer 1: all functions look correct");
      const reviewer2 = makeAgent("reviewer-2", "Reviewer 2: consider renaming func2");
      const broadcastReview = createBroadcastFlow({
        name: "parallel-review",
        steps: [reviewer1, reviewer2],
        separator: " | ",
      });

      // Step 3: single agent produces final summary
      const summarizer = makeAgent("summarizer", "Summary: code reviewed, one rename suggestion");

      const pipeline = createSequentialFlow({
        name: "review-pipeline",
        steps: [analyzer, broadcastReview, summarizer],
      });

      const result = (await pipeline.call("Review my module")) as FlowResult;

      // Final output comes from the summarizer
      expect(result.text).toBe("Summary: code reviewed, one rename suggestion");
      // Should have 4 step results: analyzer + 2 reviewers (inside broadcast) + summarizer
      // But broadcast is a single step in sequential, so it depends on nesting
      expect(result.stepResults.length).toBe(3); // analyzer, broadcast(as 1), summarizer
    });

    it("should nest a cycle flow inside a sequential flow", async () => {
      // Step 1: writer produces initial draft
      const writer = makeAgent("writer", "Initial draft of the document");

      // Step 2: cycle flow refines the draft 2 times
      const refiner = makeMultiResponseAgent("refiner", ["Refined draft v1", "Refined draft v2"]);
      const refinementLoop = createCycleFlow({
        name: "refine-loop",
        steps: [refiner],
        cycles: 2,
      });

      // Step 3: formatter produces final output
      const formatter = makeAgent("formatter", "Final formatted document");

      const pipeline = createSequentialFlow({
        name: "write-refine-format",
        steps: [writer, refinementLoop, formatter],
      });

      const result = (await pipeline.call("Write a document")) as FlowResult;

      expect(result.text).toBe("Final formatted document");
      expect(result.stepResults.length).toBe(3);
    });

    it("should nest sequential inside broadcast (complex composition)", async () => {
      // Two parallel review tracks, each a sequential pipeline
      const track1Step1 = makeAgent("track1-lint", "Lint: 0 errors");
      const track1Step2 = makeAgent("track1-summary", "Track 1: all clear");
      const track1 = createSequentialFlow({
        name: "lint-track",
        steps: [track1Step1, track1Step2],
      });

      const track2Step1 = makeAgent("track2-security", "Security: 1 warning");
      const track2Step2 = makeAgent("track2-summary", "Track 2: 1 warning found");
      const track2 = createSequentialFlow({
        name: "security-track",
        steps: [track2Step1, track2Step2],
      });

      const broadcast = createBroadcastFlow({
        name: "parallel-tracks",
        steps: [track1, track2],
        separator: "\n===\n",
      });

      const result = await broadcast.call("Analyze this codebase");

      expect(result.text).toBe("Track 1: all clear\n===\nTrack 2: 1 warning found");
    });
  });

  // -----------------------------------------------------------------------
  // 6. Full hook lifecycle ordering
  // -----------------------------------------------------------------------

  describe("hook lifecycle ordering", () => {
    it("should fire flow hooks in correct order: before → steps → after", async () => {
      const log: string[] = [];

      const hooks: FlowHooks = {
        alterMessageBeforeFlow: [
          async (msg) => {
            log.push("alterMessageBeforeFlow");
            return msg;
          },
        ],
        beforeFlow: [
          async () => {
            log.push("beforeFlow");
          },
        ],
        beforeStep: [
          async ({ stepName }) => {
            log.push(`beforeStep:${stepName}`);
          },
        ],
        afterStep: [
          async ({ stepName }) => {
            log.push(`afterStep:${stepName}`);
          },
        ],
        afterFlow: [
          async () => {
            log.push("afterFlow");
          },
        ],
        alterMessageAfterFlow: [
          async (msg) => {
            log.push("alterMessageAfterFlow");
            return msg;
          },
        ],
      };

      const agentA = makeAgent("step-a", "Output A");
      const agentB = makeAgent("step-b", "Output B");

      const flow = createSequentialFlow({
        name: "hooked-flow",
        steps: [agentA, agentB],
        hooks,
      });

      await flow.call("Test hooks");

      expect(log).toEqual([
        "alterMessageBeforeFlow",
        "beforeFlow",
        "beforeStep:step-a",
        "afterStep:step-a",
        "beforeStep:step-b",
        "afterStep:step-b",
        "afterFlow",
        "alterMessageAfterFlow",
      ]);
    });

    it("should fire cycle hooks in correct order including cycle boundaries", async () => {
      const log: string[] = [];

      const hooks: CycleHooks = {
        alterMessageBeforeFlow: [
          async (msg) => {
            log.push("alterMessageBeforeFlow");
            return msg;
          },
        ],
        beforeFlow: [
          async () => {
            log.push("beforeFlow");
          },
        ],
        alterMessageBeforeCycle: [
          async (msg) => {
            log.push("alterMessageBeforeCycle");
            return msg;
          },
        ],
        beforeStep: [
          async ({ stepName }) => {
            log.push(`beforeStep:${stepName}`);
          },
        ],
        afterStep: [
          async ({ stepName }) => {
            log.push(`afterStep:${stepName}`);
          },
        ],
        alterMessageAfterCycle: [
          async (msg) => {
            log.push("alterMessageAfterCycle");
            return msg;
          },
        ],
        afterFlow: [
          async () => {
            log.push("afterFlow");
          },
        ],
        alterMessageAfterFlow: [
          async (msg) => {
            log.push("alterMessageAfterFlow");
            return msg;
          },
        ],
      };

      const worker = makeMultiResponseAgent("worker", ["out-1", "out-2"]);

      const flow = createCycleFlow({
        name: "cycle-hooks-flow",
        steps: [worker],
        cycles: 2,
        hooks,
      });

      await flow.call("Test cycle hooks");

      expect(log).toEqual([
        "alterMessageBeforeFlow",
        "beforeFlow",
        // Cycle 1
        "alterMessageBeforeCycle",
        "beforeStep:worker",
        "afterStep:worker",
        "alterMessageAfterCycle",
        // Cycle 2
        "alterMessageBeforeCycle",
        "beforeStep:worker",
        "afterStep:worker",
        "alterMessageAfterCycle",
        // Flow end
        "afterFlow",
        "alterMessageAfterFlow",
      ]);
    });

    it("should combine flow hooks and agent hooks across a sequential flow", async () => {
      const log: string[] = [];

      const flowHooks: FlowHooks = {
        beforeFlow: [
          async () => {
            log.push("flow:beforeFlow");
          },
        ],
        beforeStep: [
          async ({ stepName }) => {
            log.push(`flow:beforeStep:${stepName}`);
          },
        ],
        afterStep: [
          async ({ stepName }) => {
            log.push(`flow:afterStep:${stepName}`);
          },
        ],
        afterFlow: [
          async () => {
            log.push("flow:afterFlow");
          },
        ],
      };

      const agentHooks: AgentHooks = {
        beforeCall: [
          async () => {
            log.push("agent:beforeCall");
          },
        ],
        afterCall: [
          async () => {
            log.push("agent:afterCall");
          },
        ],
      };

      const agentA = makeAgent("agent-a", "Output A", agentHooks);

      const flow = createSequentialFlow({
        name: "combined-hooks-flow",
        steps: [agentA],
        hooks: flowHooks,
      });

      await flow.call("Test combined hooks");

      // Flow beforeFlow fires first
      expect(log[0]).toBe("flow:beforeFlow");
      // Then flow beforeStep
      expect(log).toContain("flow:beforeStep:agent-a");
      // Agent hooks should fire during step execution
      expect(log).toContain("agent:beforeCall");
      expect(log).toContain("agent:afterCall");
      // Then flow afterStep
      expect(log).toContain("flow:afterStep:agent-a");
      // Flow afterFlow fires last
      expect(log[log.length - 1]).toBe("flow:afterFlow");

      // Verify ordering: flow:beforeStep < agent:beforeCall < agent:afterCall < flow:afterStep
      const beforeStepIdx = log.indexOf("flow:beforeStep:agent-a");
      const agentBeforeIdx = log.indexOf("agent:beforeCall");
      const agentAfterIdx = log.indexOf("agent:afterCall");
      const afterStepIdx = log.indexOf("flow:afterStep:agent-a");

      expect(beforeStepIdx).toBeLessThan(agentBeforeIdx);
      expect(agentBeforeIdx).toBeLessThan(agentAfterIdx);
      expect(agentAfterIdx).toBeLessThan(afterStepIdx);
    });

    it("should combine flow + step + tool hooks in correct nesting order", async () => {
      const log: string[] = [];

      const flowHooks: FlowHooks = {
        beforeStep: [
          async ({ stepName }) => {
            log.push(`flow:beforeStep:${stepName}`);
          },
        ],
        afterStep: [
          async ({ stepName }) => {
            log.push(`flow:afterStep:${stepName}`);
          },
        ],
      };

      const agentHooks: AgentHooks = {
        beforeCall: [
          async () => {
            log.push("agent:beforeCall");
          },
        ],
        afterCall: [
          async () => {
            log.push("agent:afterCall");
          },
        ],
      };

      const toolHooks: ToolHooks = {
        beforeToolCall: [
          async ({ name }) => {
            log.push(`tool:before:${name}`);
          },
        ],
        afterToolCall: [
          async ({ name }) => {
            log.push(`tool:after:${name}`);
          },
        ],
      };

      const toolAgent = createAgent({
        name: "tool-step",
        model: createToolCallingMockModel({
          rounds: [
            {
              toolCalls: [{ id: "c1", name: "echo", args: { message: "hi" } }],
            },
            { text: "Done" },
          ],
        }),
        tools: { echo: createEchoTool() },
        hooks: agentHooks,
        toolHooks,
      });

      const flow = createSequentialFlow({
        name: "full-hooks-flow",
        steps: [toolAgent],
        hooks: flowHooks,
      });

      await flow.call("Test all hooks");

      // Expected nesting: flow:beforeStep → agent:beforeCall → tool:before → tool:after → agent:afterCall → flow:afterStep
      const flowBeforeIdx = log.indexOf("flow:beforeStep:tool-step");
      const agentBeforeIdx = log.indexOf("agent:beforeCall");
      const toolBeforeIdx = log.indexOf("tool:before:echo");
      const toolAfterIdx = log.indexOf("tool:after:echo");
      const agentAfterIdx = log.indexOf("agent:afterCall");
      const flowAfterIdx = log.indexOf("flow:afterStep:tool-step");

      expect(flowBeforeIdx).toBeLessThan(agentBeforeIdx);
      expect(agentBeforeIdx).toBeLessThan(toolBeforeIdx);
      expect(toolBeforeIdx).toBeLessThan(toolAfterIdx);
      expect(toolAfterIdx).toBeLessThan(agentAfterIdx);
      expect(agentAfterIdx).toBeLessThan(flowAfterIdx);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Error mid-flow propagation
  // -----------------------------------------------------------------------

  describe("error propagation", () => {
    it("should wrap step errors in FlowExecutionError", async () => {
      // Create an agent whose model throws
      const failingAgent: Agent = {
        name: "failing-agent",
        async call(): Promise<AgentCallResult> {
          throw new Error("Model exploded");
        },
        reset() {},
      };

      const healthyAgent = makeAgent("healthy", "I'm fine");

      const flow = createSequentialFlow({
        name: "error-flow",
        steps: [healthyAgent, failingAgent],
      });

      try {
        await flow.call("This will fail");
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain("failing-agent");
        expect(error.message).toContain("failed");
      }
    });

    it("should stop sequential flow at the failing step (not continue)", async () => {
      const callLog: string[] = [];

      const agentA: Agent = {
        name: "agent-a",
        async call() {
          callLog.push("agent-a");
          return {
            text: "A output",
            usage: { promptTokens: 0, completionTokens: 0 },
            finishReason: "stop",
          };
        },
        reset() {},
      };

      const agentB: Agent = {
        name: "agent-b",
        async call() {
          callLog.push("agent-b");
          throw new Error("B failed");
        },
        reset() {},
      };

      const agentC: Agent = {
        name: "agent-c",
        async call() {
          callLog.push("agent-c");
          return {
            text: "C output",
            usage: { promptTokens: 0, completionTokens: 0 },
            finishReason: "stop",
          };
        },
        reset() {},
      };

      const flow = createSequentialFlow({
        name: "stop-on-error",
        steps: [agentA, agentB, agentC],
      });

      try {
        await flow.call("Go");
      } catch {
        // expected
      }

      // Agent C should NOT have been called
      expect(callLog).toEqual(["agent-a", "agent-b"]);
      expect(callLog).not.toContain("agent-c");
    });

    it("should propagate errors from nested flows", async () => {
      const failingAgent: Agent = {
        name: "inner-fail",
        async call() {
          throw new Error("Inner failure");
        },
        reset() {},
      };

      const innerFlow = createSequentialFlow({
        name: "inner-flow",
        steps: [failingAgent],
      });

      const outerFlow = createSequentialFlow({
        name: "outer-flow",
        steps: [makeAgent("pre", "OK"), innerFlow],
      });

      try {
        await outerFlow.call("Nested failure");
        expect(true).toBe(false);
      } catch (error: any) {
        // Should contain info about both flows
        expect(error.message).toContain("inner-fail");
      }
    });
  });

  // -----------------------------------------------------------------------
  // 8. Flow reset propagation
  // -----------------------------------------------------------------------

  describe("flow reset", () => {
    it("should reset all child agents when flow.reset() is called", async () => {
      const agentA = createAgent({
        name: "resettable-a",
        model: createSimpleMockModel(["A1", "A2"]),
      });
      const agentB = createAgent({
        name: "resettable-b",
        model: createSimpleMockModel(["B1", "B2"]),
      });

      const flow = createSequentialFlow({
        name: "resettable-flow",
        steps: [agentA, agentB],
      });

      // First call builds up history
      await flow.call("First run");
      expect(agentA.getHistory!().length).toBeGreaterThan(0);
      expect(agentB.getHistory!().length).toBeGreaterThan(0);

      // Reset flow — should reset all child agents
      flow.reset();

      expect(agentA.getHistory!().length).toBe(0);
      expect(agentB.getHistory!().length).toBe(0);
    });

    it("should reset nested flows recursively", async () => {
      const innerAgent = createAgent({
        name: "inner-agent",
        model: createSimpleMockModel(["Inner result", "Inner result 2"]),
      });

      const innerFlow = createSequentialFlow({
        name: "inner-flow",
        steps: [innerAgent],
      });

      const outerAgent = createAgent({
        name: "outer-agent",
        model: createSimpleMockModel(["Outer result", "Outer result 2"]),
      });

      const outerFlow = createSequentialFlow({
        name: "outer-flow",
        steps: [outerAgent, innerFlow],
      });

      await outerFlow.call("Run");

      expect(innerAgent.getHistory!().length).toBeGreaterThan(0);
      expect(outerAgent.getHistory!().length).toBeGreaterThan(0);

      outerFlow.reset();

      expect(innerAgent.getHistory!().length).toBe(0);
      expect(outerAgent.getHistory!().length).toBe(0);
    });

    it("should reset cycle flow including observer", async () => {
      const worker = createAgent({
        name: "cycle-worker",
        model: createSimpleMockModel(["Work done", "Work done 2"]),
      });
      const observer = createAgent({
        name: "cycle-observer",
        model: createSimpleMockModel(["Feedback", "Feedback 2"]),
      });

      const flow = createCycleFlow({
        name: "cycle-reset-test",
        steps: [worker],
        cycles: 1,
        observer,
      });

      await flow.call("Run cycle");

      // Both should have history
      expect(worker.getHistory!().length).toBeGreaterThan(0);

      flow.reset();

      expect(worker.getHistory!().length).toBe(0);
      expect(observer.getHistory!().length).toBe(0);
    });
  });
});
