// Tests for ConversationHistory

import { describe, expect, it } from "bun:test";
import type { UserModelMessage } from "ai";
import type { ResponseMessage } from "../types";
import { createConversationHistory } from "./conversation-history";

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

describe("createConversationHistory", () => {
  describe("construction", () => {
    it("creates an empty history with defaults", () => {
      const history = createConversationHistory();
      expect(history.length).toBe(0);
      expect(history.isEmpty).toBe(true);
    });

    it("factory with config works", () => {
      const history = createConversationHistory({ maxTurns: 5 });
      expect(history.isEmpty).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Append & basic access
  // ---------------------------------------------------------------------------

  describe("append", () => {
    it("appends a conversation turn", () => {
      const history = createConversationHistory();
      history.append("Hello", assistantResponse("Hi there!"));
      expect(history.length).toBe(1);
      expect(history.isEmpty).toBe(false);
    });

    it("does not corrupt previous state on multiple appends", () => {
      const history = createConversationHistory();
      history.append("Hello", assistantResponse("Hi"));
      history.append("Second", assistantResponse("Response"));
      expect(history.length).toBe(2);
      expect(userText(history.getTurns()[0]!)).toBe("Hello");
      expect(userText(history.getTurns()[1]!)).toBe("Second");
    });

    it("appends multiple turns in order", () => {
      const history = createConversationHistory();
      history.append("First", assistantResponse("Response 1"));
      history.append("Second", assistantResponse("Response 2"));
      history.append("Third", assistantResponse("Response 3"));
      expect(history.length).toBe(3);

      const turns = history.getTurns();
      expect(userText(turns[0]!)).toBe("First");
      expect(userText(turns[1]!)).toBe("Second");
      expect(userText(turns[2]!)).toBe("Third");
    });
  });

  // ---------------------------------------------------------------------------
  // toMessages
  // ---------------------------------------------------------------------------

  describe("toMessages", () => {
    it("returns empty array for empty history", () => {
      const history = createConversationHistory();
      expect(history.toMessages()).toEqual([]);
    });

    it("converts turns to user + response messages", () => {
      const history = createConversationHistory();
      history.append("Question 1", assistantResponse("Answer 1"));
      history.append("Question 2", assistantResponse("Answer 2"));

      const messages = history.toMessages();
      expect(messages).toEqual([
        { role: "user", content: "Question 1" },
        { role: "assistant", content: [{ type: "text", text: "Answer 1" }] },
        { role: "user", content: "Question 2" },
        { role: "assistant", content: [{ type: "text", text: "Answer 2" }] },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // getLastTurn
  // ---------------------------------------------------------------------------

  describe("getLastTurn", () => {
    it("returns undefined for empty history", () => {
      const history = createConversationHistory();
      expect(history.getLastTurn()).toBeUndefined();
    });

    it("returns the most recent turn", () => {
      const history = createConversationHistory();
      history.append("First", assistantResponse("Response 1"));
      history.append("Second", assistantResponse("Response 2"));

      const last = history.getLastTurn();
      expect(last).toBeDefined();
      expect(userText(last!)).toBe("Second");
      expect(last!.responseMessages).toEqual(assistantResponse("Response 2"));
    });
  });

  // ---------------------------------------------------------------------------
  // Sliding window truncation
  // ---------------------------------------------------------------------------

  describe("sliding window (maxTurns)", () => {
    it("drops oldest turns when exceeding maxTurns", () => {
      const history = createConversationHistory({ maxTurns: 2 });
      history.append("A", assistantResponse("1"));
      history.append("B", assistantResponse("2"));
      history.append("C", assistantResponse("3"));

      expect(history.length).toBe(2);
      const turns = history.getTurns();
      expect(userText(turns[0]!)).toBe("B");
      expect(userText(turns[1]!)).toBe("C");
    });

    it("maxTurns: 1 keeps only the latest turn", () => {
      const history = createConversationHistory({ maxTurns: 1 });
      history.append("A", assistantResponse("1"));
      history.append("B", assistantResponse("2"));
      history.append("C", assistantResponse("3"));

      expect(history.length).toBe(1);
      expect(userText(history.getTurns()[0]!)).toBe("C");
    });

    it("auto-selects sliding-window strategy when maxTurns is set", () => {
      const history = createConversationHistory({ maxTurns: 3 });
      for (let i = 0; i < 10; i++) {
        history.append(`Q${i}`, assistantResponse(`A${i}`));
      }
      expect(history.length).toBe(3);
      expect(userText(history.getTurns()[0]!)).toBe("Q7");
    });
  });

  // ---------------------------------------------------------------------------
  // Token-based truncation
  // ---------------------------------------------------------------------------

  describe("token-based truncation (maxTokens)", () => {
    it("drops oldest turns when estimated tokens exceed maxTokens", () => {
      const history = createConversationHistory({
        maxTokens: 20,
        tokensPerChar: 1,
      });

      history.append("AAAAA", assistantResponse("BBBBB")); // 10 tokens total
      history.append("CCCCC", assistantResponse("DDDDD")); // 20 tokens total
      expect(history.length).toBe(2);

      history.append("EEEEE", assistantResponse("FFFFF")); // 30 tokens → truncate
      expect(history.length).toBe(2);
      expect(userText(history.getTurns()[0]!)).toBe("CCCCC");
      expect(userText(history.getTurns()[1]!)).toBe("EEEEE");
    });

    it("auto-selects sliding-window strategy when maxTokens is set", () => {
      const history = createConversationHistory({
        maxTokens: 10,
        tokensPerChar: 1,
      });

      history.append("ABC", assistantResponse("DEF")); // 6 tokens
      expect(history.length).toBe(1);

      history.append("GHI", assistantResponse("JKL")); // 12 tokens → truncate
      expect(history.length).toBe(1);
      expect(userText(history.getTurns()[0]!)).toBe("GHI");
    });
  });

  // ---------------------------------------------------------------------------
  // No truncation
  // ---------------------------------------------------------------------------

  describe("no truncation", () => {
    it("keeps all history when truncation is 'none'", () => {
      const history = createConversationHistory({ truncation: "none" });
      for (let i = 0; i < 100; i++) {
        history.append(`Q${i}`, assistantResponse(`A${i}`));
      }
      expect(history.length).toBe(100);
    });

    it("defaults to 'none' when no maxTurns or maxTokens specified", () => {
      const history = createConversationHistory();
      for (let i = 0; i < 50; i++) {
        history.append(`Q${i}`, assistantResponse(`A${i}`));
      }
      expect(history.length).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // estimateTokens
  // ---------------------------------------------------------------------------

  describe("estimateTokens", () => {
    it("returns 0 for empty history", () => {
      const history = createConversationHistory();
      expect(history.estimateTokens()).toBe(0);
    });

    it("estimates with default tokensPerChar (0.25)", () => {
      const history = createConversationHistory();
      history.append("Hello", assistantResponse("World"));
      // "Hello" (5) + "World" (5) = 10 chars * 0.25 = 2.5 → ceil → 3
      expect(history.estimateTokens()).toBe(3);
    });

    it("estimates with custom tokensPerChar", () => {
      const history = createConversationHistory({ tokensPerChar: 1 });
      history.append("ABCD", assistantResponse("EFGH"));
      expect(history.estimateTokens()).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // Snapshot & restore
  // ---------------------------------------------------------------------------

  describe("snapshot/restore", () => {
    it("creates a frozen snapshot", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));
      history.append("Q2", assistantResponse("A2"));

      const snap = history.snapshot();
      expect(snap.length).toBe(2);
      expect(Object.isFrozen(snap)).toBe(true);
    });

    it("snapshot is independent of future changes", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));
      const snap = history.snapshot();

      history.append("Q2", assistantResponse("A2"));
      expect(snap.length).toBe(1);
      expect(history.length).toBe(2);
    });

    it("restores from a snapshot", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));
      history.append("Q2", assistantResponse("A2"));
      const snap = history.snapshot();

      history.clear();
      expect(history.length).toBe(0);

      history.restore(snap);
      expect(history.length).toBe(2);
      expect(userText(history.getTurns()[0]!)).toBe("Q1");
    });

    it("restore applies truncation rules", () => {
      const history = createConversationHistory({ maxTurns: 1 });
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

      history.restore(snap);
      expect(history.length).toBe(1);
      expect(userText(history.getTurns()[0]!)).toBe("Q3");
    });
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  describe("clear", () => {
    it("removes all turns", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));
      history.append("Q2", assistantResponse("A2"));
      history.clear();

      expect(history.length).toBe(0);
      expect(history.isEmpty).toBe(true);
      expect(history.toMessages()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Iteration
  // ---------------------------------------------------------------------------

  describe("iteration", () => {
    it("is iterable with for...of", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));
      history.append("Q2", assistantResponse("A2"));

      const userTexts: string[] = [];
      for (const turn of history) {
        userTexts.push(userText(turn));
      }

      expect(userTexts).toEqual(["Q1", "Q2"]);
    });

    it("can spread into an array", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));

      const arr = [...history];
      expect(arr.length).toBe(1);
      expect(userText(arr[0]!)).toBe("Q1");
    });
  });

  // ---------------------------------------------------------------------------
  // Combined maxTurns + maxTokens
  // ---------------------------------------------------------------------------

  describe("combined maxTurns + maxTokens", () => {
    it("enforces both limits (maxTurns hits first)", () => {
      const history = createConversationHistory({
        maxTurns: 2,
        maxTokens: 1000,
        tokensPerChar: 1,
      });

      history.append("A", assistantResponse("B"));
      history.append("C", assistantResponse("D"));
      history.append("E", assistantResponse("F"));

      expect(history.length).toBe(2);
      expect(userText(history.getTurns()[0]!)).toBe("C");
    });

    it("enforces both limits (maxTokens hits first)", () => {
      const history = createConversationHistory({
        maxTurns: 100,
        maxTokens: 10,
        tokensPerChar: 1,
      });

      history.append("AAA", assistantResponse("BBB")); // 6
      history.append("CCC", assistantResponse("DDD")); // 12 → truncate
      expect(history.length).toBe(1);
      expect(userText(history.getTurns()[0]!)).toBe("CCC");
    });
  });
});
