// Tests for message builder — buildMessages and resolveSystemPrompt.

import { describe, expect, it } from "bun:test";
import { createConversationContext } from "../context/conversation-context";
import type { ResponseMessage } from "../context/conversation-context.types";
import { buildMessages, resolveSystemPrompt } from "./message-builder";
import { createPromptTemplate } from "./template/prompt-template";

// Helpers

/** Create a ResponseMessage[] containing a single assistant text message. */
function assistantResponse(text: string): ResponseMessage[] {
  return [{ role: "assistant", content: [{ type: "text", text }] }];
}

// buildMessages

describe("buildMessages", () => {
  describe("basic usage", () => {
    it("should return just the user message when no context or extras", () => {
      const messages = buildMessages({ message: "Hello" });

      expect(messages).toEqual([{ role: "user", content: "Hello" }]);
    });

    it("should prepend context before the current message", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));

      const messages = buildMessages({ message: "Q2", context });

      expect(messages).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: [{ type: "text", text: "A1" }] },
        { role: "user", content: "Q2" },
      ]);
    });

    it("should handle multi-turn context", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));
      context.append("Q2", assistantResponse("A2"));

      const messages = buildMessages({ message: "Q3", context });

      expect(messages).toEqual([
        { role: "user", content: "Q1" },
        { role: "assistant", content: [{ type: "text", text: "A1" }] },
        { role: "user", content: "Q2" },
        { role: "assistant", content: [{ type: "text", text: "A2" }] },
        { role: "user", content: "Q3" },
      ]);
    });

    it("should handle empty context", () => {
      const context = createConversationContext();
      const messages = buildMessages({ message: "Hello", context });

      expect(messages).toEqual([{ role: "user", content: "Hello" }]);
    });
  });

  describe("prefix messages", () => {
    it("should prepend prefix before context", () => {
      const context = createConversationContext();
      context.append("Q1", assistantResponse("A1"));

      const messages = buildMessages({
        message: "Q2",
        context,
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

    it("should work without context", () => {
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

  describe("full composition", () => {
    it("should compose all parts in correct order", () => {
      const context = createConversationContext();
      context.append("H1", assistantResponse("R1"));

      const messages = buildMessages({
        message: "Current question",
        context,
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
  it("should return undefined when no prompt configured", async () => {
    const result = await resolveSystemPrompt({});
    expect(result).toBeUndefined();
  });

  it("should return static systemPrompt", async () => {
    const result = await resolveSystemPrompt({
      systemPrompt: "You are helpful.",
    });
    expect(result).toBe("You are helpful.");
  });

  it("should resolve a prompt template", async () => {
    const template = createPromptTemplate({
      template: "You are {{ role }}, an expert in {{ lang }}.",
      variables: { role: "a reviewer", lang: "TypeScript" },
    });

    const result = await resolveSystemPrompt({
      systemPrompt: template,
    });
    expect(result).toBe("You are a reviewer, an expert in TypeScript.");
  });

  it("should render template with baked-in variables", async () => {
    const template = createPromptTemplate({
      template: "Expert in {{ lang }}.",
      variables: { lang: "TypeScript" },
    });

    const result = await resolveSystemPrompt({
      systemPrompt: template,
    });
    expect(result).toBe("Expert in TypeScript.");
  });

  it("should use PromptTemplate when provided as systemPrompt", async () => {
    const template = createPromptTemplate({
      template: "From template: {{ role }}",
      variables: { role: "dynamic" },
    });

    const result = await resolveSystemPrompt({
      systemPrompt: template,
    });
    expect(result).toBe("From template: dynamic");
  });
});
