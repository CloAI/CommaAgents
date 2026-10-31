import { afterEach, describe, expect, it } from "bun:test";
import { tool, type LanguageModel } from "ai";
import { z } from "zod";
import { registerModel, resetModelRegistry } from "../../model/model";
import { hookIntoAgent } from "../hook-into-agent/hook-into-agent";
import { createAgent } from "./agent";
import type { AgentCallResult } from "./agent.types";

function createSteeringModel(firstToolNames: readonly string[] = []) {
  const requests: string[] = [];
  const aborted = Promise.withResolvers<void>();
  const model: LanguageModel = {
    specificationVersion: "v3",
    provider: "steering-test",
    modelId: "writer",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("These tests exercise streaming calls");
    },
    async doStream(options) {
      requests.push(JSON.stringify(options.prompt));
      const initial = requests.length === 1;
      return {
        stream: new ReadableStream({
          start(controller) {
            if (initial && firstToolNames.length) {
              for (const toolName of firstToolNames) {
                controller.enqueue({
                  type: "tool-call",
                  toolCallId: `${toolName}-call`,
                  toolName,
                  input: "{}",
                });
              }
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage: {
                  inputTokens: {
                    total: 2,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: 1,
                    text: undefined,
                    reasoning: undefined,
                  },
                },
              });
              controller.close();
              return;
            }
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta: initial ? "Original partial answer" : "Steered answer",
            });
            if (initial) {
              const cancel = () => {
                aborted.resolve();
                controller.error(
                  new DOMException("Generation aborted", "AbortError"),
                );
              };
              if (options.abortSignal?.aborted) cancel();
              else
                options.abortSignal?.addEventListener("abort", cancel, {
                  once: true,
                });
            } else {
              controller.enqueue({ type: "text-end", id: "answer" });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: {
                    total: 2,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: 1,
                    text: undefined,
                    reasoning: undefined,
                  },
                },
              });
              controller.close();
            }
          },
        }),
      };
    },
  };
  registerModel("mock/steering", model);
  return { requests, aborted: aborted.promise };
}

afterEach(() => resetModelRegistry());

describe("agent steering", () => {
  it("should retain partial context and resume the same call with the user's correction", async () => {
    const { requests, aborted } = createSteeringModel();
    const agent = createAgent({ name: "writer", model: "mock/steering" });
    const completed: AgentCallResult[] = [];
    const identities: string[] = [];
    let failedCalls = 0;
    let accepted = false;
    hookIntoAgent(agent, {
      onCallStarted: [
        ({ messageId }) => {
          identities.push(messageId);
        },
      ],
      onCallFailed: [
        () => {
          failedCalls++;
        },
      ],
      onCallCompleted: [
        (result) => {
          completed.push(result);
        },
      ],
      onStreamEvent: [
        (event) => {
          if (
            event.type === "text" &&
            event.text === "Original partial answer"
          ) {
            accepted =
              agent.steer?.(
                event.messageId!,
                "Please focus on the second approach",
              ) ?? false;
          }
        },
      ],
    });

    expect(agent.steer?.("stale", "Ignore this")).toBe(false);
    const result = await agent.call("Compare the approaches");
    await aborted;

    expect(accepted).toBe(true);
    expect(result.text).toBe("Steered answer");
    expect(failedCalls).toBe(0);
    expect(identities).toHaveLength(2);
    expect(identities[0]).not.toBe(identities[1]);
    expect(completed.map((entry) => entry.finishReason)).toEqual([
      "user_steering",
      "stop",
    ]);
    expect(completed[0]?.text).toBe("Original partial answer");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("Original partial answer");
    expect(requests[1]).toContain("Please focus on the second approach");
    expect(agent.getConversationContext?.().records()).toHaveLength(2);
    expect(agent.steer?.(identities[0]!, "Too late")).toBe(false);
    expect(agent.steer?.(identities[1]!, "Also too late")).toBe(false);
  });

  it("should persist accepted steering before starting the resumed model request", async () => {
    const { requests, aborted } = createSteeringModel();
    const persistence = Promise.withResolvers<void>();
    const interrupted = Promise.withResolvers<void>();
    const agent = createAgent({ name: "writer", model: "mock/steering" });
    let persistenceStarted = false;
    hookIntoAgent(agent, {
      onCallCompleted: [
        (result) => {
          if (result.finishReason === "user_steering") interrupted.resolve();
        },
      ],
      onStreamEvent: [
        (event) => {
          if (
            event.type === "text" &&
            event.text === "Original partial answer"
          ) {
            expect(
              agent.steer?.(event.messageId!, "Use the correction", () => {
                persistenceStarted = true;
                return persistence.promise;
              }),
            ).toBe(true);
          }
        },
      ],
    });

    const running = agent.call("Original task");
    await aborted;
    expect(persistenceStarted).toBe(true);
    expect(requests).toHaveLength(1);
    persistence.resolve();
    expect((await running).text).toBe("Steered answer");
    await interrupted.promise;
    expect(requests).toHaveLength(2);
  });

  it("should stop the run instead of resuming when cancellation wins during steering persistence", async () => {
    const { requests, aborted } = createSteeringModel();
    const persistence = Promise.withResolvers<void>();
    const agent = createAgent({ name: "writer", model: "mock/steering" });
    hookIntoAgent(agent, {
      onStreamEvent: [
        (event) => {
          if (
            event.type === "text" &&
            event.text === "Original partial answer"
          ) {
            expect(
              agent.steer?.(
                event.messageId!,
                "Use the correction",
                () => persistence.promise,
              ),
            ).toBe(true);
          }
        },
      ],
    });

    const running = agent.call("Original task");
    const outcome = running.then(
      () => ({ completed: true, error: undefined }),
      (error: unknown) => ({ completed: false, error }),
    );
    await aborted;
    running.abort();
    persistence.resolve();
    const stopped = await outcome;
    expect(stopped.completed).toBe(false);
    expect(stopped.error).toBeInstanceOf(Error);
    expect(requests).toHaveLength(1);
  });

  it("should request tool cancellation and await its actual settlement before resuming", async () => {
    const { requests } = createSteeringModel(["slow"]);
    const cancellationRequested = Promise.withResolvers<void>();
    const toolSettlement = Promise.withResolvers<void>();
    let messageId = "";
    let toolFinished = false;
    const agent = createAgent(
      { name: "writer", model: "mock/steering" },
      {
        mcpTools: {
          slow: tool({
            inputSchema: z.object({}),
            execute: async (_arguments, { abortSignal }) => {
              abortSignal?.addEventListener(
                "abort",
                () => cancellationRequested.resolve(),
                { once: true },
              );
              expect(
                agent.steer?.(messageId, "Stop that tool and explain"),
              ).toBe(true);
              await toolSettlement.promise;
              toolFinished = true;
              return "Tool settled after cancellation";
            },
          }),
        },
      },
    );
    hookIntoAgent(agent, {
      onCallStarted: [
        (identity) => {
          messageId = identity.messageId;
        },
      ],
    });

    const running = agent.call("Start the slow operation");
    await cancellationRequested.promise;
    expect(requests).toHaveLength(1);
    expect(toolFinished).toBe(false);
    toolSettlement.resolve();
    expect((await running).text).toBe("Steered answer");
    expect(toolFinished).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it("should preserve completed and cancelled parallel tool outcomes without replaying tools", async () => {
    const { requests } = createSteeringModel(["completed", "cancelled"]);
    const cancellationRequested = Promise.withResolvers<void>();
    const toolSettlement = Promise.withResolvers<void>();
    let messageId = "";
    let completedCalls = 0;
    let cancelledCalls = 0;
    const agent = createAgent(
      { name: "writer", model: "mock/steering" },
      {
        mcpTools: {
          completed: tool({
            inputSchema: z.object({}),
            execute: async () => {
              completedCalls++;
              return "Completed operation result";
            },
          }),
          cancelled: tool({
            inputSchema: z.object({}),
            execute: async (_arguments, { abortSignal }): Promise<string> => {
              cancelledCalls++;
              abortSignal?.addEventListener(
                "abort",
                () => cancellationRequested.resolve(),
                { once: true },
              );
              expect(
                agent.steer?.(messageId, "Explain the existing results"),
              ).toBe(true);
              await toolSettlement.promise;
              throw new DOMException(
                "Tool cancelled by steering",
                "AbortError",
              );
            },
          }),
        },
      },
    );
    hookIntoAgent(agent, {
      onCallStarted: [
        (identity) => {
          messageId = identity.messageId;
        },
      ],
    });

    const running = agent.call("Run both operations");
    await cancellationRequested.promise;
    toolSettlement.resolve();
    expect((await running).text).toBe("Steered answer");
    expect(completedCalls).toBe(1);
    expect(cancelledCalls).toBe(1);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("completed-call");
    expect(requests[1]).toContain("Completed operation result");
    expect(requests[1]).toContain("cancelled-call");
    expect(requests[1]).toContain("Tool cancelled by steering");
    const interrupted = agent.getConversationContext?.().records()[0];
    const responses = JSON.stringify(interrupted?.responseMessages);
    expect(responses.match(/"type":"tool-call"/g)).toHaveLength(2);
    expect(responses.match(/"type":"tool-result"/g)).toHaveLength(2);
  });

  it("should retain streamed tool output and leave shared tool executors unchanged across steering", async () => {
    const { requests } = createSteeringModel(["progress"]);
    const toolOutputs: string[] = [];
    let toolCalls = 0;
    let steeringAccepted = false;
    const progressTool = tool({
      inputSchema: z.object({}),
      execute: async function* (this: unknown) {
        expect(this).toBe(progressTool);
        toolCalls++;
        yield "Interim progress";
        yield "Final streamed tool result";
      },
    });
    const originalExecute = progressTool.execute;
    const sharedTools = { progress: progressTool };
    const agent = createAgent(
      { name: "writer", model: "mock/steering", maxSteps: 3 },
      { mcpTools: sharedTools },
    );
    hookIntoAgent(agent, {
      onStreamEvent: [
        (event) => {
          if (event.type === "tool-result") toolOutputs.push(event.output);
          if (event.type === "text" && !steeringAccepted) {
            steeringAccepted =
              agent.steer?.(
                event.messageId!,
                "Use the completed streamed result",
              ) ?? false;
          }
        },
      ],
    });

    expect((await agent.call("Run the streaming tool")).text).toBe(
      "Steered answer",
    );
    expect(steeringAccepted).toBe(true);
    expect(toolCalls).toBe(1);
    expect(toolOutputs).toContain("Interim progress");
    expect(toolOutputs).toContain("Final streamed tool result");
    expect(requests).toHaveLength(3);
    expect(requests[1]).toContain("Final streamed tool result");
    expect(requests[2]).toContain("Final streamed tool result");
    expect(requests[2]).toContain("Use the completed streamed result");
    expect(sharedTools.progress).toBe(progressTool);
    expect(sharedTools.progress.execute).toBe(originalExecute);
  });

  it("should preserve repeated steering in acceptance order and reject a stale recipient", async () => {
    const { requests } = createSteeringModel();
    const agent = createAgent({ name: "writer", model: "mock/steering" });
    let stalePersistence = false;
    hookIntoAgent(agent, {
      onStreamEvent: [
        (event) => {
          if (
            event.type === "text" &&
            event.text === "Original partial answer"
          ) {
            expect(
              agent.steer?.("stale", "Wrong recipient", async () => {
                stalePersistence = true;
              }),
            ).toBe(false);
            expect(
              agent.steer?.(event.messageId!, "FIRST: focus on correctness"),
            ).toBe(true);
            expect(
              agent.steer?.(event.messageId!, "SECOND: keep it concise"),
            ).toBe(true);
          }
        },
      ],
    });

    expect((await agent.call("Original task")).text).toBe("Steered answer");
    expect(stalePersistence).toBe(false);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("FIRST: focus on correctness");
    expect(requests[1]).toContain("SECOND: keep it concise");
    expect(requests[1]!.indexOf("FIRST:")).toBeLessThan(
      requests[1]!.indexOf("SECOND:"),
    );
  });

  it("should fail without resuming if accepted steering cannot be persisted", async () => {
    const { requests } = createSteeringModel();
    const agent = createAgent({ name: "writer", model: "mock/steering" });
    hookIntoAgent(agent, {
      onStreamEvent: [
        (event) => {
          if (
            event.type === "text" &&
            event.text === "Original partial answer"
          ) {
            expect(
              agent.steer?.(event.messageId!, "Correction", async () => {
                throw new Error("Steering persistence failed");
              }),
            ).toBe(true);
          }
        },
      ],
    });

    await expect(agent.call("Original task")).rejects.toThrow(
      "Steering persistence failed",
    );
    expect(requests).toHaveLength(1);
  });

  it("should not accept steering or run its persistence callback for a custom executor", async () => {
    const agent = createAgent({
      name: "preset",
      execute: async () => "Preset output",
    });
    let persisted = false;
    hookIntoAgent(agent, {
      onCallStarted: [
        ({ messageId }) => {
          expect(
            agent.steer?.(messageId, "Correction", async () => {
              persisted = true;
            }),
          ).toBe(false);
        },
      ],
    });

    expect((await agent.call("Input")).text).toBe("Preset output");
    expect(persisted).toBe(false);
  });
});
