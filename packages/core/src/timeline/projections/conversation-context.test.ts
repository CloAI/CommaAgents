import { describe, expect, it } from "bun:test";
import { createConversationRecord } from "../../conversation-context";
import type { TimelineEvent } from "../timeline.types";
import { projectConversationContext } from "./conversation-context";

function makeAgentCall(
  agentName: string,
  userText: string,
  assistantText: string,
): TimelineEvent {
  const record = createConversationRecord({
    id: `${agentName}-${userText}`,
    agentName,
    createdAt: "2026-01-01T00:00:00.000Z",
    userMessage: userText,
    responseMessages: [
      { role: "assistant", content: [{ type: "text", text: assistantText }] },
    ],
    text: assistantText,
    usage: { promptTokens: 1, completionTokens: 1 },
    finishReason: "stop",
  });
  return {
    type: "agent_call",
    ts: record.createdAt,
    record,
  };
}

describe("projectConversationContext", () => {
  it("should extract records for the requested agent", () => {
    const events: TimelineEvent[] = [
      makeAgentCall("writer", "Hello", "Hi"),
      makeAgentCall("critic", "Review this", "Looks bad"),
      makeAgentCall("writer", "Refactor", "Ok"),
    ];

    const context = projectConversationContext(events, "writer");
    expect(context.length).toBe(2);
    expect(context.records[0]?.userMessage.content).toBe("Hello");
    expect(context.records[1]?.userMessage.content).toBe("Refactor");

    const criticContext = projectConversationContext(events, "critic");
    expect(criticContext.length).toBe(1);
    expect(criticContext.records[0]?.userMessage.content).toBe("Review this");
  });

  it("should project records into model messages", () => {
    const context = projectConversationContext([
      makeAgentCall("writer", "Hello", "Hi"),
    ]);

    expect(context.messages).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: [{ type: "text", text: "Hi" }] },
    ]);
  });
});
