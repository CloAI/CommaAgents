import { describe, expect, it } from "bun:test";
import type { TimelineEvent } from "../timeline.types";
import { projectConversationContext } from "./conversation-context";

const makeAgentCall = (
  agentName: string,
  userText: string,
  assistantText: string,
): TimelineEvent => {
  return {
    type: "agent_call",
    ts: new Date().toISOString(),
    agentName,
    userMessage: { role: "user", content: userText },
    responseMessages: [
      { role: "assistant", content: [{ type: "text", text: assistantText }] },
    ],
  };
};

describe("projectConversationContext", () => {
  it("should extract turns for the requested agent", () => {
    const events: TimelineEvent[] = [
      makeAgentCall("writer", "Hello", "Hi"),
      makeAgentCall("critic", "Review this", "Looks bad"),
      makeAgentCall("writer", "Refactor", "Ok"),
    ];

    const context = projectConversationContext(events, "writer");
    expect(context.length).toBe(2);
    expect(context.turns[0]?.userMessage.content).toBe("Hello");
    expect(context.turns[1]?.userMessage.content).toBe("Refactor");

    const criticContext = projectConversationContext(events, "critic");
    expect(criticContext.length).toBe(1);
    expect(criticContext.turns[0]?.userMessage.content).toBe("Review this");
  });

  it("should respect maxTurns sliding window", () => {
    const events: TimelineEvent[] = [
      makeAgentCall("writer", "1", "a"),
      makeAgentCall("writer", "2", "b"),
      makeAgentCall("writer", "3", "c"),
    ];

    const context = projectConversationContext(events, "writer", {
      maxTurns: 2,
    });
    expect(context.length).toBe(2);
    expect(context.turns[0]?.userMessage.content).toBe("2");
    expect(context.turns[1]?.userMessage.content).toBe("3");
  });

  it("should respect maxTokens budget sliding window", () => {
    const events: TimelineEvent[] = [
      makeAgentCall("writer", "short message", "reply"), // ~18 chars * 0.25 = ~4.5 tokens
      makeAgentCall(
        "writer",
        "this is a very long message indeed",
        "another very long response back",
      ), // ~65 chars * 0.25 = ~16 tokens
    ];

    // Total characters for first: 13 + 5 = 18. Estimated tokens = 5
    // Total characters for second: 34 + 31 = 65. Estimated tokens = 17
    // Setting maxTokens to 20 should drop the first turn when the second is appended
    const context = projectConversationContext(events, "writer", {
      maxTokens: 20,
    });
    expect(context.length).toBe(1);
    expect(context.turns[0]?.userMessage.content).toBe(
      "this is a very long message indeed",
    );
  });
});
