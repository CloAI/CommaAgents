// Tests for message builder — buildMessages and resolveSystemPrompt

import { describe, expect, it } from "bun:test";
import { createConversationHistory } from "./history/conversation-history";
import { buildMessages, resolveSystemPrompt } from "./message-builder";
import { createPromptTemplate } from "./template/prompt-template";
import type { ResponseMessage } from "./types";

// Helpers

/** Create a ResponseMessage[] containing a single assistant text message. */
function assistantResponse(text: string): ResponseMessage[] {
  return [{ role: "assistant", content: [{ type: "text", text }] }];
}

// buildMessages

describe("buildMessages", () => {
  describe("basic usage", () => {
    it("returns just the user message when no history or extras", () => {
      const messages = buildMessages({ message: "Hello" });

      expect(messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("prepends history before the current message", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));

      const messages = buildMessages({ message: "Q2", history });

      expect(messages).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: [{ type: "text", text: "A1" }] },
        { role: "user", content: "Q2" },
      ]);
    });

    it("handles multi-turn history", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));
      history.append("Q2", assistantResponse("A2"));

      const messages = buildMessages({ message: "Q3", history });

      expect(messages).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: [{ type: "text", text: "A1" }] },
        { role: "user", content: "Q2" },
        { role: "assistant", content: [{ type: "text", text: "A2" }] },
        { role: "user", content: "Q3" },
      ]);
    });

    it("handles empty history", () => {
      const history = createConversationHistory();
      const messages = buildMessages({ message: "Hello", history });

      expect(messages).toEqual([{ role: "user", content: "Hello" }]);
    });
  });

  // ---------------------------------------------------------------------------
  // Prefix messages
  // ---------------------------------------------------------------------------

  describe("prefix messages", () => {
    it("prepends prefix before history", () => {
      const history = createConversationHistory();
      history.append("Q1", assistantResponse("A1"));

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
        { role: "assistant", content: [{ type: "text", text: "A1" }] },
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
  // Full composition: prefix + history + message
  // ---------------------------------------------------------------------------

  describe("full composition", () => {
    it("composes all parts in correct order", () => {
      const history = createConversationHistory();
      history.append("H1", assistantResponse("R1"));

      const messages = buildMessages({
        message: "Current question",
        history,
        prefix: [
          { role: "user", content: "Few-shot Q" },
          { role: "assistant", content: "Few-shot A" },
        ],
      });

      expect(messages).toEqual([
        { role: "user", content: "Few-shot Q" },
        { role: "assistant", content: "Few-shot A" },
        { role: "user", content: "H1" },
        { role: "assistant", content: [{ type: "text", text: "R1" }] },
        { role: "user", content: "Current question" },
      ]);
    });
  });
});

// resolveSystemPrompt

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
      template: "You are {{ role }}, an expert in {{ lang }}.",
      variables: { role: "a reviewer", lang: "TypeScript" },
    });

    const result = await resolveSystemPrompt({
      systemPromptTemplate: template,
    });
    expect(result).toBe("You are a reviewer, an expert in TypeScript.");
  });

  it("template overrides work", async () => {
    const template = createPromptTemplate({
      template: "Expert in {{ lang }}.",
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
      template: "From template: {{ role }}",
      variables: { role: "dynamic" },
    });

    const result = await resolveSystemPrompt({
      systemPrompt: "Static prompt",
      systemPromptTemplate: template,
    });
    expect(result).toBe("From template: dynamic");
  });
});
