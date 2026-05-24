import { describe, expect, it, mock } from "bun:test";
import type { ConversationTurn } from "../../context/conversation-context.types";
import { createAgent } from "./agent";

const makeTurn = (
  userText: string,
  assistantText: string,
): ConversationTurn => {
  return {
    agentName: "assistant",
    userMessage: { role: "user", content: userText },
    responseMessages: [
      { role: "assistant", content: [{ type: "text", text: assistantText }] },
    ],
  };
};

describe("Agent Replay", () => {
  it("should replay hydrated turns without invoking execute override", async () => {
    const executeMock = mock(() => "Fresh execution");
    const agent = createAgent({
      name: "assistant",
      execute: executeMock,
    });

    const turns = [
      makeTurn("Hello", "Replayed 1"),
      makeTurn("How are you?", "Replayed 2"),
    ];

    agent.hydrateForReplay?.(turns);

    // Call 1 — Replayed 1
    const res1 = await agent.call("Hello");
    expect(res1.text).toBe("Replayed 1");
    expect(executeMock).not.toHaveBeenCalled();

    // Call 2 — Replayed 2
    const res2 = await agent.call("How are you?");
    expect(res2.text).toBe("Replayed 2");
    expect(executeMock).not.toHaveBeenCalled();

    // Call 3 — Transitions back to live!
    const res3 = await agent.call("What now?");
    expect(res3.text).toBe("Fresh execution");
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(agent.getConversationContext?.().length).toBe(3);
  });

  it("should support clearing replay mode on reset()", async () => {
    const executeMock = mock(() => "Live response");
    const agent = createAgent({
      name: "assistant",
      execute: executeMock,
    });

    agent.hydrateForReplay?.([makeTurn("Hello", "Replayed")]);
    agent.reset();

    const res = await agent.call("Hello");
    expect(res.text).toBe("Live response");
    expect(executeMock).toHaveBeenCalledTimes(1);
  });
});
