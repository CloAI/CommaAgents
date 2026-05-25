import { describe, expect, it } from "bun:test";
import { projectRunTurnToMessages } from "./useChat.utils";

const makeTurn = (
  userText: string,
  assistantText: string,
  agentName = "expert",
): any => {
  return {
    agentName,
    userMessage: { role: "user", content: userText },
    responseMessages: [
      { role: "assistant", content: [{ type: "text", text: assistantText }] },
    ],
  };
};

describe("TUI Resume E2E projection deduplication", () => {
  it("should output both a 'you' message and an agent response when prompt and reply are different", () => {
    const turn = makeTurn("What is 1+1?", "It is 2.");
    let count = 0;
    const nextId = () => `msg-${++count}`;

    const messages = projectRunTurnToMessages(turn, nextId, Date.now());

    // Should produce exactly two messages: one "user" and one "agent"
    expect(messages.length).toBe(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.sender).toBe("you");
    expect(messages[0]?.text).toBe("What is 1+1?");

    expect(messages[1]?.role).toBe("agent");
    expect(messages[1]?.sender).toBe("expert");
    expect(messages[1]?.text).toBe("It is 2.");
  });

  it("should NOT output duplicate agent-bubble when user prompt and reply are identical (user step)", () => {
    // For human-in-the-loop user agent steps, the prompt and replayed reply are identical.
    const turn = makeTurn(
      "What is the smallest tower in the world?",
      "What is the smallest tower in the world?",
      "user",
    );
    let count = 0;
    const nextId = () => `msg-${++count}`;

    const messages = projectRunTurnToMessages(turn, nextId, Date.now());

    // Should produce exactly one message: the "you" user bubble, and NO duplicate user-agent bubble!
    expect(messages.length).toBe(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.sender).toBe("you");
    expect(messages[0]?.text).toBe("What is the smallest tower in the world?");
  });
});
