// Tests for ConversationHistory

import { describe, expect, it } from "bun:test";
import { ConversationHistory, createConversationHistory } from "./conversation-history";

// ---------------------------------------------------------------------------
// Construction & factory
// ---------------------------------------------------------------------------

describe("ConversationHistory", () => {
  describe("construction", () => {
    it("creates an empty history with defaults", () => {
      const history = new ConversationHistory();
      expect(history.length).toBe(0);
      expect(history.isEmpty).toBe(true);
    });

    it("createConversationHistory factory works", () => {
      const history = createConversationHistory({ maxTurns: 5 });
      expect(history).toBeInstanceOf(ConversationHistory);
      expect(history.isEmpty).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Append & basic access
  // ---------------------------------------------------------------------------

  describe("append", () => {
    it("appends a conversation turn", () => {
      const history = new ConversationHistory();
      history.append("Hello", "Hi there!");
      expect(history.length).toBe(1);
      expect(history.isEmpty).toBe(false);
    });

    it("appends multiple turns in order", () => {
      const history = new ConversationHistory();
      history.append("First", "Response 1");
      history.append("Second", "Response 2");
      history.append("Third", "Response 3");
      expect(history.length).toBe(3);

      const turns = history.getTurns();
      expect(turns[0]!.userMessage).toBe("First");
      expect(turns[1]!.userMessage).toBe("Second");
      expect(turns[2]!.userMessage).toBe("Third");
    });
  });

  // ---------------------------------------------------------------------------
  // toMessages
  // ---------------------------------------------------------------------------

  describe("toMessages", () => {
    it("returns empty array for empty history", () => {
      const history = new ConversationHistory();
      expect(history.toMessages()).toEqual([]);
    });

    it("converts turns to alternating user/assistant messages", () => {
      const history = new ConversationHistory();
      history.append("Question 1", "Answer 1");
      history.append("Question 2", "Answer 2");

      const messages = history.toMessages();
      expect(messages).toEqual([
        { role: "user", content: "Question 1" },
        { role: "assistant", content: "Answer 1" },
        { role: "user", content: "Question 2" },
        { role: "assistant", content: "Answer 2" },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // getLastTurn
  // ---------------------------------------------------------------------------

  describe("getLastTurn", () => {
    it("returns undefined for empty history", () => {
      const history = new ConversationHistory();
      expect(history.getLastTurn()).toBeUndefined();
    });

    it("returns the most recent turn", () => {
      const history = new ConversationHistory();
      history.append("First", "Response 1");
      history.append("Second", "Response 2");

      const last = history.getLastTurn();
      expect(last).toEqual({
        userMessage: "Second",
        assistantMessage: "Response 2",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Sliding window truncation
  // ---------------------------------------------------------------------------

  describe("sliding window (maxTurns)", () => {
    it("drops oldest turns when exceeding maxTurns", () => {
      const history = new ConversationHistory({ maxTurns: 2 });
      history.append("A", "1");
      history.append("B", "2");
      history.append("C", "3");

      expect(history.length).toBe(2);
      const turns = history.getTurns();
      expect(turns[0]!.userMessage).toBe("B");
      expect(turns[1]!.userMessage).toBe("C");
    });

    it("maxTurns: 1 keeps only the latest turn", () => {
      const history = new ConversationHistory({ maxTurns: 1 });
      history.append("A", "1");
      history.append("B", "2");
      history.append("C", "3");

      expect(history.length).toBe(1);
      expect(history.getTurns()[0]!.userMessage).toBe("C");
    });

    it("auto-selects sliding-window strategy when maxTurns is set", () => {
      const history = new ConversationHistory({ maxTurns: 3 });
      for (let i = 0; i < 10; i++) {
        history.append(`Q${i}`, `A${i}`);
      }
      expect(history.length).toBe(3);
      expect(history.getTurns()[0]!.userMessage).toBe("Q7");
    });
  });

  // ---------------------------------------------------------------------------
  // Token-based truncation
  // ---------------------------------------------------------------------------

  describe("token-based truncation (maxTokens)", () => {
    it("drops oldest turns when estimated tokens exceed maxTokens", () => {
      // tokensPerChar = 1 for easy math (1 char = 1 token)
      const history = new ConversationHistory({
        maxTokens: 20,
        tokensPerChar: 1,
      });

      // Each turn: 5 chars user + 5 chars assistant = 10 tokens
      history.append("AAAAA", "BBBBB"); // 10 tokens total
      history.append("CCCCC", "DDDDD"); // 20 tokens total
      expect(history.length).toBe(2);

      history.append("EEEEE", "FFFFF"); // 30 tokens → truncate
      // Should drop oldest until ≤ 20
      expect(history.length).toBe(2);
      expect(history.getTurns()[0]!.userMessage).toBe("CCCCC");
      expect(history.getTurns()[1]!.userMessage).toBe("EEEEE");
    });

    it("auto-selects sliding-window strategy when maxTokens is set", () => {
      const history = new ConversationHistory({
        maxTokens: 10,
        tokensPerChar: 1,
      });

      // 6 chars per turn → 6 tokens per turn
      history.append("ABC", "DEF"); // 6 tokens
      expect(history.length).toBe(1);

      history.append("GHI", "JKL"); // 12 tokens → truncate to ≤ 10
      expect(history.length).toBe(1);
      expect(history.getTurns()[0]!.userMessage).toBe("GHI");
    });
  });

  // ---------------------------------------------------------------------------
  // No truncation
  // ---------------------------------------------------------------------------

  describe("no truncation", () => {
    it("keeps all history when truncation is 'none'", () => {
      const history = new ConversationHistory({ truncation: "none" });
      for (let i = 0; i < 100; i++) {
        history.append(`Q${i}`, `A${i}`);
      }
      expect(history.length).toBe(100);
    });

    it("defaults to 'none' when no maxTurns or maxTokens specified", () => {
      const history = new ConversationHistory();
      for (let i = 0; i < 50; i++) {
        history.append(`Q${i}`, `A${i}`);
      }
      expect(history.length).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // estimateTokens
  // ---------------------------------------------------------------------------

  describe("estimateTokens", () => {
    it("returns 0 for empty history", () => {
      const history = new ConversationHistory();
      expect(history.estimateTokens()).toBe(0);
    });

    it("estimates with default tokensPerChar (0.25)", () => {
      const history = new ConversationHistory();
      // "Hello" (5) + "World" (5) = 10 chars * 0.25 = 2.5 → ceil → 3
      history.append("Hello", "World");
      expect(history.estimateTokens()).toBe(3);
    });

    it("estimates with custom tokensPerChar", () => {
      const history = new ConversationHistory({ tokensPerChar: 1 });
      history.append("ABCD", "EFGH"); // 8 chars * 1 = 8
      expect(history.estimateTokens()).toBe(8);
    });
  });

  // ---------------------------------------------------------------------------
  // Snapshot & restore
  // ---------------------------------------------------------------------------

  describe("snapshot/restore", () => {
    it("creates a frozen snapshot", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");
      history.append("Q2", "A2");

      const snap = history.snapshot();
      expect(snap.length).toBe(2);
      expect(Object.isFrozen(snap)).toBe(true);
    });

    it("snapshot is independent of future changes", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");
      const snap = history.snapshot();

      history.append("Q2", "A2");
      expect(snap.length).toBe(1);
      expect(history.length).toBe(2);
    });

    it("restores from a snapshot", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");
      history.append("Q2", "A2");
      const snap = history.snapshot();

      history.clear();
      expect(history.length).toBe(0);

      history.restore(snap);
      expect(history.length).toBe(2);
      expect(history.getTurns()[0]!.userMessage).toBe("Q1");
    });

    it("restore applies truncation rules", () => {
      const history = new ConversationHistory({ maxTurns: 1 });
      const snap = [
        { userMessage: "Q1", assistantMessage: "A1" },
        { userMessage: "Q2", assistantMessage: "A2" },
        { userMessage: "Q3", assistantMessage: "A3" },
      ];

      history.restore(snap);
      expect(history.length).toBe(1);
      expect(history.getTurns()[0]!.userMessage).toBe("Q3");
    });
  });

  // ---------------------------------------------------------------------------
  // Clear
  // ---------------------------------------------------------------------------

  describe("clear", () => {
    it("removes all turns", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");
      history.append("Q2", "A2");
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
      const history = new ConversationHistory();
      history.append("Q1", "A1");
      history.append("Q2", "A2");

      const collected: Array<{ userMessage: string; assistantMessage: string }> = [];
      for (const turn of history) {
        collected.push(turn);
      }

      expect(collected).toEqual([
        { userMessage: "Q1", assistantMessage: "A1" },
        { userMessage: "Q2", assistantMessage: "A2" },
      ]);
    });

    it("can spread into an array", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");

      const arr = [...history];
      expect(arr.length).toBe(1);
      expect(arr[0]!.userMessage).toBe("Q1");
    });
  });

  // ---------------------------------------------------------------------------
  // Combined maxTurns + maxTokens
  // ---------------------------------------------------------------------------

  describe("combined maxTurns + maxTokens", () => {
    it("enforces both limits (maxTurns hits first)", () => {
      const history = new ConversationHistory({
        maxTurns: 2,
        maxTokens: 1000,
        tokensPerChar: 1,
      });

      history.append("A", "B");
      history.append("C", "D");
      history.append("E", "F");

      // maxTurns = 2 is the binding constraint
      expect(history.length).toBe(2);
      expect(history.getTurns()[0]!.userMessage).toBe("C");
    });

    it("enforces both limits (maxTokens hits first)", () => {
      const history = new ConversationHistory({
        maxTurns: 100,
        maxTokens: 10,
        tokensPerChar: 1,
      });

      // Each turn = 6 tokens (3 + 3)
      history.append("AAA", "BBB"); // 6
      history.append("CCC", "DDD"); // 12 → truncate to ≤ 10
      expect(history.length).toBe(1);
      expect(history.getTurns()[0]!.userMessage).toBe("CCC");
    });
  });
});
