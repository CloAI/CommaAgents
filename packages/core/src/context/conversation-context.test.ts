// Tests for createConversationContext — closure-based conversation turn management.

import { describe, expect, it } from "bun:test";
import type { UserModelMessage } from "ai";
import { createConversationContext } from "./conversation-context";
import type { ResponseMessage } from "./conversation-context.types";

// Helpers

/** Create a ResponseMessage[] containing a single assistant text message. */
function assistantResponse(text: string): ResponseMessage[] {
  return [{ role: "assistant", content: [{ type: "text", text }] }];
}

/**
 * Extract the user message text from a ConversationTurn.
 * Handles both string and Part[] content formats.
 */
function userText(turn: { userMessage: UserModelMessage }): string {
  const content = turn.userMessage.content;
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

// Tests

describe("createConversationContext", () => {
  describe("construction", () => {
    it("should create an empty context with defaults", () => {
      const context = createConversationContext();
      expect(context.length).toBe(0);
      expect(context.isEmpty).toBe(true);
    });

    it("should accept config options", () => {
      const context = createConversationContext({ maxTurns: 5 });
      expect(context.isEmpty).toBe(true);
    });
  });

  describe("append", () => {
    it("should append a conversation turn", () => {
      const context = createConversationContext();
      context.append("Hello", assistantResponse("Hi there!"));
      expect(context.length).toBe(1);
      expect(context.isEmpty).toBe(false);
    });

    it("should not corrupt previous state on multiple appends", () => {
      const context = createConversationContext();
      context.append("Hello", assistantResponse("Hi"));
      context.append("Second", assistantResponse("Response"));
      expect(context.length).toBe(2);
      expect(userText(context.allTurns()[0]!)).toBe("Hello");
      expect(userText(context.allTurns()[1]!)).toBe("Second");
    });

    it("should append multiple turns in order", () => {
      const context = createConversationContext();
      context.append("First", assistantResponse("Response 1"));
      context.append("Second", assistantResponse("Response 2"));
      context.append("Third", assistantResponse("Response 3"));
      expect(context.length).toBe(3);

      const turns = context.allTurns();
      expect(userText(turns[0]!)).toBe("First");
      expect(userText(turns[1]!)).toBe("Second");
      expect(userText(turns[2]!)).toBe("Third");
    });
  });

  describe("allMessages", () => {
    it("should return empty array for empty context", () => {
      const context = createConversationContext();
      expect(context.allMessages()).toEqual([]);
    });

    it("should convert turns to user + response messages", () => {
      const context = createConversationContext();
      context.append("Question 1", assistantResponse("Answer 1"));
      context.append("Question 2", assistantResponse("Answer 2"));

      const messages = context.allMessages();
      expect(messages).toEqual([
        { role: "user", content: "Question 1" },
        { role: "assistant", content: [{ type: "text", text: "Answer 1" }] },
        { role: "user", content: "Question 2" },
        { role: "assistant", content: [{ type: "text", text: "Answer 2" }] },
      ]);
    });
  });

  describe("lastTurn", () => {
    it("should return undefined for empty context", () => {
      const context = createConversationContext();
      expect(context.lastTurn()).toBeUndefined();
    });

    it("should return the most recent turn", () => {
      const context = createConversationContext();
      context.append("First", assistantResponse("Response 1"));
      context.append("Second", assistantResponse("Response 2"));

      const last = context.lastTurn();
      expect(last).toBeDefined();
      expect(userText(last!)).toBe("Second");
      expect(last?.responseMessages).toEqual(assistantResponse("Response 2"));
    });
  });

  describe("sliding window (maxTurns)", () => {
    it("should drop oldest turns when exceeding maxTurns", () => {
      const context = createConversationContext({ maxTurns: 2 });
      context.append("A", assistantResponse("1"));
      context.append("B", assistantResponse("2"));
      context.append("C", assistantResponse("3"));

      expect(context.length).toBe(2);
      const turns = context.allTurns();
      expect(userText(turns[0]!)).toBe("B");
      expect(userText(turns[1]!)).toBe("C");
    });

    it("should keep only the latest turn when maxTurns is 1", () => {
      const context = createConversationContext({ maxTurns: 1 });
      context.append("A", assistantResponse("1"));
      context.append("B", assistantResponse("2"));
      context.append("C", assistantResponse("3"));

      expect(context.length).toBe(1);
      expect(userText(context.allTurns()[0]!)).toBe("C");
    });

    it("should auto-select sliding-window strategy when maxTurns is set", () => {
      const context = createConversationContext({ maxTurns: 3 });
      for (let turnIndex = 0; turnIndex < 10; turnIndex++) {
        context.append(`Q${turnIndex}`, assistantResponse(`A${turnIndex}`));
      }
      expect(context.length).toBe(3);
      expect(userText(context.allTurns()[0]!)).toBe("Q7");
    });
  });

  describe("token-based truncation (maxTokens)", () => {
    it("should drop oldest turns when estimated tokens exceed maxTokens", () => {
      const context = createConversationContext({
        maxTokens: 20,
        tokensPerChar: 1,
      });

      context.append("AAAAA", assistantResponse("BBBBB")); // 10 tokens total
      context.append("CCCCC", assistantResponse("DDDDD")); // 20 tokens total
      expect(context.length).toBe(2);

      context.append("EEEEE", assistantResponse("FFFFF")); // 30 tokens → truncate
      expect(context.length).toBe(2);
      expect(userText(context.allTurns()[0]!)).toBe("CCCCC");
      expect(userText(context.allTurns()[1]!)).toBe("EEEEE");
    });

    it("should auto-select sliding-window strategy when maxTokens is set", () => {
      const context = createConversationContext({
        maxTokens: 10,
        tokensPerChar: 1,
      });

      context.append("ABC", assistantResponse("DEF")); // 6 tokens
      expect(context.length).toBe(1);

      context.append("GHI", assistantResponse("JKL")); // 12 tokens → truncate
      expect(context.length).toBe(1);
      expect(userText(context.allTurns()[0]!)).toBe("GHI");
    });
  });

  describe("no truncation", () => {
    it("should keep all turns when strategy is 'none'", () => {
      const context = createConversationContext({ strategy: "none" });
      for (let turnIndex = 0; turnIndex < 100; turnIndex++) {
        context.append(`Q${turnIndex}`, assistantResponse(`A${turnIndex}`));
      }
      expect(context.length).toBe(100);
    });

    it("should default to 'none' when no maxTurns or maxTokens specified", () => {
      const context = createConversationContext();
      for (let turnIndex = 0; turnIndex < 50; turnIndex++) {
        context.append(`Q${turnIndex}`, assistantResponse(`A${turnIndex}`));
      }
      expect(context.length).toBe(50);
    });
  });

  describe("estimateTokens", () => {
    it("should return 0 for empty context", () => {
      const context = createConversationContext();
      expect(context.estimateTokens()).toBe(0);
    });

    it("should estimate with default tokensPerChar (0.25)", () => {
      const context = createConversationContext();
      context.append("Hello", assistantResponse("World"));
      // "Hello" (5) + "World" (5) = 10 chars * 0.25 = 2.5 → ceil → 3
      expect(context.estimateTokens()).toBe(3);
    });

    it("should estimate with custom tokensPerChar", () => {
      const context = createConversationContext({ tokensPerChar: 1 });
      context.append("ABCD", assistantResponse("EFGH"));
      expect(context.estimateTokens()).toBe(8);
    });
  });

  describe("snapshot/restore", () => {
    it("should create a frozen snapshot", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));
      context.append("Q2", assistantResponse("A2"));

      const snap = context.snapshot();
      expect(snap.length).toBe(2);
      expect(Object.isFrozen(snap)).toBe(true);
    });

    it("should produce a snapshot independent of future changes", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));
      const snap = context.snapshot();

      context.append("Q2", assistantResponse("A2"));
      expect(snap.length).toBe(1);
      expect(context.length).toBe(2);
    });

    it("should restore from a snapshot", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));
      context.append("Q2", assistantResponse("A2"));
      const snap = context.snapshot();

      context.clear();
      expect(context.length).toBe(0);

      context.restore(snap);
      expect(context.length).toBe(2);
      expect(userText(context.allTurns()[0]!)).toBe("Q1");
    });

    it("should apply strategy rules when restoring", () => {
      const context = createConversationContext({ maxTurns: 1 });
      const snap = [
        {
          userMessage: { role: "user" as const, content: "Q1" },
          responseMessages: assistantResponse("A1"),
        },
        {
          userMessage: { role: "user" as const, content: "Q2" },
          responseMessages: assistantResponse("A2"),
        },
        {
          userMessage: { role: "user" as const, content: "Q3" },
          responseMessages: assistantResponse("A3"),
        },
      ];

      context.restore(snap);
      expect(context.length).toBe(1);
      expect(userText(context.allTurns()[0]!)).toBe("Q3");
    });
  });

  describe("clear", () => {
    it("should remove all turns", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));
      context.append("Q2", assistantResponse("A2"));
      context.clear();

      expect(context.length).toBe(0);
      expect(context.isEmpty).toBe(true);
      expect(context.allMessages()).toEqual([]);
    });
  });

  describe("iteration", () => {
    it("should be iterable with for...of", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));
      context.append("Q2", assistantResponse("A2"));

      const userTexts: string[] = [];
      for (const turn of context) {
        userTexts.push(userText(turn));
      }

      expect(userTexts).toEqual(["Q1", "Q2"]);
    });

    it("should support spread into an array", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));

      const spreadArray = [...context];
      expect(spreadArray.length).toBe(1);
      expect(userText(spreadArray[0]!)).toBe("Q1");
    });
  });

  describe("combined maxTurns + maxTokens", () => {
    it("should enforce both limits when maxTurns hits first", () => {
      const context = createConversationContext({
        maxTurns: 2,
        maxTokens: 1000,
        tokensPerChar: 1,
      });

      context.append("A", assistantResponse("B"));
      context.append("C", assistantResponse("D"));
      context.append("E", assistantResponse("F"));

      expect(context.length).toBe(2);
      expect(userText(context.allTurns()[0]!)).toBe("C");
    });

    it("should enforce both limits when maxTokens hits first", () => {
      const context = createConversationContext({
        maxTurns: 100,
        maxTokens: 10,
        tokensPerChar: 1,
      });

      context.append("AAA", assistantResponse("BBB")); // 6
      context.append("CCC", assistantResponse("DDD")); // 12 → truncate
      expect(context.length).toBe(1);
      expect(userText(context.allTurns()[0]!)).toBe("CCC");
    });
  });
});
