import { describe, expect, it } from "bun:test";
import { createSystemRunContext } from "../systems.test.utils";
import { createQuestionSystem } from "./question";

const request = {
  agentName: "assistant",
  toolName: "ask_question",
  question: "Which option?",
};

describe("createQuestionSystem", () => {
  it("requests and resolves a question through the system", async () => {
    const context = createSystemRunContext();
    const system = createQuestionSystem();
    system.onRunPrepare?.(context);

    const requester = context.systemData.get("questionRequester");
    if (!requester) throw new Error("Question requester was not registered");

    const result = requester(request);
    const message = context.sink.broadcasts[0]?.message;
    if (message?.type !== "request_question") {
      throw new Error("Question request was not broadcast");
    }

    expect(
      context.actions.invoke(
        "resolveQuestion",
        context.run.id,
        message.requestId,
        "The first option",
      ),
    ).toBe(true);
    expect(await result).toBe("The first option");
  });

  it("assigns a unique ID to each pending question", async () => {
    const context = createSystemRunContext();
    const system = createQuestionSystem();
    system.onRunPrepare?.(context);

    const requester = context.systemData.get("questionRequester");
    if (!requester) throw new Error("Question requester was not registered");

    const first = requester(request);
    const second = requester(request);
    const firstMessage = context.sink.broadcasts[0]?.message;
    const secondMessage = context.sink.broadcasts[1]?.message;
    if (
      firstMessage?.type !== "request_question" ||
      secondMessage?.type !== "request_question"
    ) {
      throw new Error("Expected two question requests");
    }

    expect(firstMessage.requestId).not.toBe(secondMessage.requestId);
    context.actions.invoke(
      "resolveQuestion",
      context.run.id,
      firstMessage.requestId,
      "first",
    );
    context.actions.invoke(
      "resolveQuestion",
      context.run.id,
      secondMessage.requestId,
      "second",
    );
    expect(await first).toBe("first");
    expect(await second).toBe("second");
  });

  it("rejects pending questions and unregisters actions during cleanup", async () => {
    const context = createSystemRunContext();
    const system = createQuestionSystem();
    system.onRunPrepare?.(context);

    const requester = context.systemData.get("questionRequester");
    if (!requester) throw new Error("Question requester was not registered");
    const result = requester(request);

    await system.onRunCleanup?.(context);

    await expect(result).rejects.toThrow("Question system cleaned up");
    expect(
      context.actions.invoke(
        "resolveQuestion",
        context.run.id,
        "missing",
        "answer",
      ),
    ).toBe(false);
  });

  it("rejects pending questions when the run is aborted", async () => {
    const context = createSystemRunContext();
    const system = createQuestionSystem();
    system.onRunPrepare?.(context);

    const requester = context.systemData.get("questionRequester");
    if (!requester) throw new Error("Question requester was not registered");
    const result = requester(request);

    context.run.abortController.abort();

    await expect(result).rejects.toThrow("Run aborted");
  });
});
