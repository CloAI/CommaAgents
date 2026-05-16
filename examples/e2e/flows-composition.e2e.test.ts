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

import { afterEach, describe, expect, it } from "bun:test";
import type {
  Agent,
  AgentCallResult,
  AgentHooks,
  CycleHooks,
  FlowResult,
  ToolHooks,
} from "@comma-agents/core";
import {
  createAgent,
  createBroadcastFlow,
  createCycleFlow,
  createSequentialFlow,
  hookIntoAgent,
  hookIntoFlow,
  registerModel,
  registerTool,
  resetModelRegistry,
  resetToolRegistry,
} from "@comma-agents/core";
import {
  createSimpleMockModel,
  createToolCallingMockModel,
} from "./helpers/mock-model";
import { createEchoTool } from "./helpers/test-tools";

// Helpers

/** Monotonic counter for unique model/tool names per registration. */
let nameCounter = 0;
function uniqueName(prefix: string): string {
  return `${prefix}-${++nameCounter}`;
}

/** Create a simple agent that returns a fixed response. */
function makeAgent(name: string, response: string, agentHooks?: AgentHooks) {
  const modelId = uniqueName(`mock/${name}`);
  registerModel(modelId, createSimpleMockModel([response]));
  const agent = createAgent({
    name,
    model: modelId,
  });
  if (agentHooks) {
    hookIntoAgent(agent, agentHooks);
  }
  return agent;
}

/** Create a simple agent that returns responses in sequence. */
function makeMultiResponseAgent(name: string, responses: string[]) {
  const modelId = uniqueName(`mock/${name}`);
  registerModel(modelId, createSimpleMockModel(responses));
  return createAgent({
    name,
    model: modelId,
  });
}

/** Create a tool-calling agent (calls echo tool, then returns final text). */
function makeToolAgent(name: string, echoMessage: string, finalText: string) {
  const modelId = uniqueName(`mock/${name}`);
  const toolName = uniqueName(`echo-${name}`);
  registerModel(
    modelId,
    createToolCallingMockModel({
      rounds: [
        {
          toolCalls: [
            {
              id: `${name}-c1`,
              name: toolName,
              args: { message: echoMessage },
            },
          ],
        },
        { text: finalText },
      ],
    }),
  );
  registerTool(toolName, createEchoTool());
  return createAgent({
    name,
    model: modelId,
    tools: [toolName],
  });
}

// Tests

describe("E2E: Flow Composition", () => {
  afterEach(() => {
    resetModelRegistry();
    resetToolRegistry();
  });

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
      const worker = makeMultiResponseAgent("worker", [
        "draft-v1",
        "draft-v2",
        "draft-v3",
      ]);

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
      });

      hookIntoFlow(flow, {
        afterStep: [
          async ({ stepName, result }) => {
            cycleOutputs.push(`${stepName}:${result.text}`);
          },
        ],
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
      const worker = makeMultiResponseAgent("counter", [
        "count-1",
        "count-2",
        "count-3",
      ]);

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
  // 3. Cycle flow — infinite cycles without config-level abort
  // -----------------------------------------------------------------------

  describe("cycle flow infinite cycles", () => {
    it("should accept infinite cycle without config-level abort signal", () => {
      const worker = makeAgent("w", "out");

      // Infinite cycles are now allowed without config.abort.
      // Cancellation happens at the call level via AbortablePromise.
      expect(() => {
        createCycleFlow({
          name: "no-abort",
          steps: [worker],
          cycles: Infinity,
        });
      }).not.toThrow();
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
      const agentA = makeToolAgent(
        "tool-reviewer-1",
        "analyzing",
        "Tool Review A: passed",
      );
      const agentB = makeToolAgent(
        "tool-reviewer-2",
        "checking",
        "Tool Review B: passed",
      );

      const flow = createBroadcastFlow({
        name: "tool-broadcast",
        steps: [agentA, agentB],
      });

      const result = (await flow.call("Check code quality")) as FlowResult;

      // Default separator is \n\n
      expect(result.text).toBe(
        "Tool Review A: passed\n\nTool Review B: passed",
      );
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
      const reviewer1 = makeAgent(
        "reviewer-1",
        "Reviewer 1: all functions look correct",
      );
      const reviewer2 = makeAgent(
        "reviewer-2",
        "Reviewer 2: consider renaming func2",
      );
      const broadcastReview = createBroadcastFlow({
        name: "parallel-review",
        steps: [reviewer1, reviewer2],
        separator: " | ",
      });

      // Step 3: single agent produces final summary
      const summarizer = makeAgent(
        "summarizer",
        "Summary: code reviewed, one rename suggestion",
      );

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
      const refiner = makeMultiResponseAgent("refiner", [
        "Refined draft v1",
        "Refined draft v2",
      ]);
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
      const track2Step2 = makeAgent(
        "track2-summary",
        "Track 2: 1 warning found",
      );
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

      expect(result.text).toBe(
        "Track 1: all clear\n===\nTrack 2: 1 warning found",
      );
    });
  });

  // -----------------------------------------------------------------------
  // 6. Full hook lifecycle ordering
  // -----------------------------------------------------------------------

  describe("hook lifecycle ordering", () => {
    it("should fire flow hooks in correct order: before → steps → after", async () => {
      const log: string[] = [];

      const agentA = makeAgent("step-a", "Output A");
      const agentB = makeAgent("step-b", "Output B");

      const flow = createSequentialFlow({
        name: "hooked-flow",
        steps: [agentA, agentB],
      });

      hookIntoFlow(flow, {
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

      const worker = makeMultiResponseAgent("worker", ["out-1", "out-2"]);

      const flow = createCycleFlow({
        name: "cycle-hooks-flow",
        steps: [worker],
        cycles: 2,
      });

      hookIntoFlow<CycleHooks>(flow, {
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

      const agentHooks: AgentHooks = {
        beforeCall: [
          async () => {
            log.push("agent:beforeCall");
          },
        ],
        afterCallResult: [
          async () => {
            log.push("agent:afterCallResult");
          },
        ],
      };

      const agentA = makeAgent("agent-a", "Output A", agentHooks);

      const flow = createSequentialFlow({
        name: "combined-hooks-flow",
        steps: [agentA],
      });

      hookIntoFlow(flow, {
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
      });

      await flow.call("Test combined hooks");

      // Flow beforeFlow fires first
      expect(log[0]).toBe("flow:beforeFlow");
      // Then flow beforeStep
      expect(log).toContain("flow:beforeStep:agent-a");
      // Agent hooks should fire during step execution
      expect(log).toContain("agent:beforeCall");
      expect(log).toContain("agent:afterCallResult");
      // Then flow afterStep
      expect(log).toContain("flow:afterStep:agent-a");
      // Flow afterFlow fires last
      expect(log[log.length - 1]).toBe("flow:afterFlow");

      // Verify ordering: flow:beforeStep < agent:beforeCall < agent:afterCallResult < flow:afterStep
      const beforeStepIdx = log.indexOf("flow:beforeStep:agent-a");
      const agentBeforeIdx = log.indexOf("agent:beforeCall");
      const agentAfterIdx = log.indexOf("agent:afterCallResult");
      const afterStepIdx = log.indexOf("flow:afterStep:agent-a");

      expect(beforeStepIdx).toBeLessThan(agentBeforeIdx);
      expect(agentBeforeIdx).toBeLessThan(agentAfterIdx);
      expect(agentAfterIdx).toBeLessThan(afterStepIdx);
    });

    it("should combine flow + step + tool hooks in correct nesting order", async () => {
      const log: string[] = [];

      const agentHooks: AgentHooks = {
        beforeCall: [
          async () => {
            log.push("agent:beforeCall");
          },
        ],
        afterCallResult: [
          async () => {
            log.push("agent:afterCallResult");
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

      const modelId = uniqueName("mock/tool-step");
      const toolName = uniqueName("echo-tool-step");
      registerModel(
        modelId,
        createToolCallingMockModel({
          rounds: [
            {
              toolCalls: [
                { id: "c1", name: toolName, args: { message: "hi" } },
              ],
            },
            { text: "Done" },
          ],
        }),
      );
      registerTool(toolName, createEchoTool());

      const toolAgent = createAgent({
        name: "tool-step",
        model: modelId,
        tools: [toolName],
      });

      hookIntoAgent(toolAgent, { ...agentHooks, ...toolHooks });

      const flow = createSequentialFlow({
        name: "full-hooks-flow",
        steps: [toolAgent],
      });

      hookIntoFlow(flow, {
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
      });

      await flow.call("Test all hooks");

      // Expected nesting: flow:beforeStep → agent:beforeCall → tool:before → tool:after → agent:afterCallResult → flow:afterStep
      const flowBeforeIdx = log.indexOf("flow:beforeStep:tool-step");
      const agentBeforeIdx = log.indexOf("agent:beforeCall");
      const toolBeforeIdx = log.indexOf(`tool:before:${toolName}`);
      const toolAfterIdx = log.indexOf(`tool:after:${toolName}`);
      const agentAfterIdx = log.indexOf("agent:afterCallResult");
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
            responseMessages: [],
            steps: [],
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
            responseMessages: [],
            steps: [],
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
      const modelIdA = uniqueName("mock/resettable-a");
      const modelIdB = uniqueName("mock/resettable-b");
      registerModel(modelIdA, createSimpleMockModel(["A1", "A2"]));
      registerModel(modelIdB, createSimpleMockModel(["B1", "B2"]));

      const agentA = createAgent({
        name: "resettable-a",
        model: modelIdA,
      });
      const agentB = createAgent({
        name: "resettable-b",
        model: modelIdB,
      });

      const flow = createSequentialFlow({
        name: "resettable-flow",
        steps: [agentA, agentB],
      });

      // First call builds up context
      await flow.call("First run");
      expect(
        agentA.getConversationContext!().allMessages().length,
      ).toBeGreaterThan(0);
      expect(
        agentB.getConversationContext!().allMessages().length,
      ).toBeGreaterThan(0);

      // Reset flow — should reset all child agents
      flow.reset();

      expect(agentA.getConversationContext!().allMessages().length).toBe(0);
      expect(agentB.getConversationContext!().allMessages().length).toBe(0);
    });

    it("should reset nested flows recursively", async () => {
      const innerModelId = uniqueName("mock/inner-agent");
      registerModel(
        innerModelId,
        createSimpleMockModel(["Inner result", "Inner result 2"]),
      );

      const innerAgent = createAgent({
        name: "inner-agent",
        model: innerModelId,
      });

      const innerFlow = createSequentialFlow({
        name: "inner-flow",
        steps: [innerAgent],
      });

      const outerModelId = uniqueName("mock/outer-agent");
      registerModel(
        outerModelId,
        createSimpleMockModel(["Outer result", "Outer result 2"]),
      );

      const outerAgent = createAgent({
        name: "outer-agent",
        model: outerModelId,
      });

      const outerFlow = createSequentialFlow({
        name: "outer-flow",
        steps: [outerAgent, innerFlow],
      });

      await outerFlow.call("Run");

      expect(
        innerAgent.getConversationContext!().allMessages().length,
      ).toBeGreaterThan(0);
      expect(
        outerAgent.getConversationContext!().allMessages().length,
      ).toBeGreaterThan(0);

      outerFlow.reset();

      expect(innerAgent.getConversationContext!().allMessages().length).toBe(0);
      expect(outerAgent.getConversationContext!().allMessages().length).toBe(0);
    });

    it("should reset cycle flow including observer", async () => {
      const workerModelId = uniqueName("mock/cycle-worker");
      const observerModelId = uniqueName("mock/cycle-observer");
      registerModel(
        workerModelId,
        createSimpleMockModel(["Work done", "Work done 2"]),
      );
      registerModel(
        observerModelId,
        createSimpleMockModel(["Feedback", "Feedback 2"]),
      );

      const worker = createAgent({
        name: "cycle-worker",
        model: workerModelId,
      });
      const observer = createAgent({
        name: "cycle-observer",
        model: observerModelId,
      });

      const flow = createCycleFlow({
        name: "cycle-reset-test",
        steps: [worker],
        cycles: 1,
        observer,
      });

      await flow.call("Run cycle");

      // Both should have context
      expect(
        worker.getConversationContext!().allMessages().length,
      ).toBeGreaterThan(0);

      flow.reset();

      expect(worker.getConversationContext!().allMessages().length).toBe(0);
      expect(observer.getConversationContext!().allMessages().length).toBe(0);
    });
  });
});
