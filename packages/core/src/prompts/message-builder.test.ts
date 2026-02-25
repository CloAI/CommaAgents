// Tests for message builder — buildMessages and resolveSystemPrompt

import { describe, expect, it } from "bun:test";
import { ConversationHistory } from "./history/conversation-history";
import { buildMessages, resolveSystemPrompt } from "./message-builder";
import { createPromptTemplate } from "./template/prompt-template";

// ---------------------------------------------------------------------------
// buildMessages
// ---------------------------------------------------------------------------

describe("buildMessages", () => {
  describe("basic usage", () => {
    it("returns just the user message when no history or extras", () => {
      const messages = buildMessages({ message: "Hello" });

      expect(messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("prepends history before the current message", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");

      const messages = buildMessages({ message: "Q2", history });

      expect(messages).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
      ]);
    });

    it("handles multi-turn history", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");
      history.append("Q2", "A2");

      const messages = buildMessages({ message: "Q3", history });

      expect(messages).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
        { role: "assistant", content: "A2" },
        { role: "user", content: "Q3" },
      ]);
    });

    it("handles empty history", () => {
      const history = new ConversationHistory();
      const messages = buildMessages({ message: "Hello", history });

      expect(messages).toEqual([{ role: "user", content: "Hello" }]);
    });
  });

  // ---------------------------------------------------------------------------
  // Prefix messages
  // ---------------------------------------------------------------------------

  describe("prefix messages", () => {
    it("prepends prefix before history", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");

      const messages = buildMessages({
        message: "Q2",
        history,
        prefix: [
          { role: "user", content: "Example Q" },
          { role: "assistant", content: "Example A" },
        ],
      });

      expect(messages).toEqual([
        { role: "user", content: "Example Q" },
        { role: "assistant", content: "Example A" },
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
      ]);
    });

    it("prefix works without history", () => {
      const messages = buildMessages({
        message: "Question",
        prefix: [{ role: "system", content: "Context info" }],
      });

      expect(messages).toEqual([
        { role: "system", content: "Context info" },
        { role: "user", content: "Question" },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Suffix messages
  // ---------------------------------------------------------------------------

  describe("suffix messages", () => {
    it("inserts suffix after history but before current message", () => {
      const history = new ConversationHistory();
      history.append("Q1", "A1");

      const messages = buildMessages({
        message: "Q2",
        history,
        suffix: [{ role: "user", content: "Retrieved context: ..." }],
      });

      expect(messages).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Retrieved context: ..." },
        { role: "user", content: "Q2" },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Full composition: prefix + history + suffix + message
  // ---------------------------------------------------------------------------

  describe("full composition", () => {
    it("composes all parts in correct order", () => {
      const history = new ConversationHistory();
      history.append("H1", "R1");

      const messages = buildMessages({
        message: "Current question",
        history,
        prefix: [
          { role: "user", content: "Few-shot Q" },
          { role: "assistant", content: "Few-shot A" },
        ],
        suffix: [{ role: "user", content: "RAG context" }],
      });

      expect(messages).toEqual([
        { role: "user", content: "Few-shot Q" },
        { role: "assistant", content: "Few-shot A" },
        { role: "user", content: "H1" },
        { role: "assistant", content: "R1" },
        { role: "user", content: "RAG context" },
        { role: "user", content: "Current question" },
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// resolveSystemPrompt
// ---------------------------------------------------------------------------

describe("resolveSystemPrompt", () => {
  it("returns undefined when no prompt configured", async () => {
    const result = await resolveSystemPrompt({});
    expect(result).toBeUndefined();
  });

  it("returns static systemPrompt", async () => {
    const result = await resolveSystemPrompt({
      systemPrompt: "You are helpful.",
    });
    expect(result).toBe("You are helpful.");
  });

  it("resolves a prompt template", async () => {
    const template = createPromptTemplate({
      template: "You are {role}, an expert in {lang}.",
      variables: { role: "a reviewer", lang: "TypeScript" },
    });

    const result = await resolveSystemPrompt({
      systemPromptTemplate: template,
    });
    expect(result).toBe("You are a reviewer, an expert in TypeScript.");
  });

  it("template overrides work", async () => {
    const template = createPromptTemplate({
      template: "Expert in {lang}.",
      variables: { lang: "TypeScript" },
    });

    const result = await resolveSystemPrompt({
      systemPromptTemplate: template,
      templateOverrides: { lang: "Rust" },
    });
    expect(result).toBe("Expert in Rust.");
  });

  it("template takes precedence over static systemPrompt", async () => {
    const template = createPromptTemplate({
      template: "From template: {role}",
      variables: { role: "dynamic" },
    });

    const result = await resolveSystemPrompt({
      systemPrompt: "Static prompt",
      systemPromptTemplate: template,
    });
    expect(result).toBe("From template: dynamic");
  });
});
