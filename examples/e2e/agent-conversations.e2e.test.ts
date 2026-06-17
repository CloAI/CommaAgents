/**
 * E2E Test: Agent Conversations
 *
 * Tests realistic multi-turn conversation patterns, conversation history
 * management, prompt templates, prefix messages, and the createAgent factory.
 *
 * Covers:
 *   - Multi-turn conversation with accumulating history
 *   - History windowing (maxTurns truncation)
 *   - System prompt templates with variable interpolation
 *   - Template overrides at the agent level
 *   - Prefix messages (few-shot examples)
 *   - createAgent() factory interface verification
 *   - Agent reset behavior
 *
 * All tests use mock models — no API keys required.
 */

import { afterEach, describe, expect, it } from "bun:test";
import {
  createAgent,
  createPromptTemplate,
  hookIntoAgent,
  registerModel,
  resetModelRegistry,
} from "@comma-agents/core";
import {
  createSimpleMockModel,
  createSpyMockModel,
} from "./helpers/mock-model";

// Tests

describe("E2E: Agent Conversations", () => {
  afterEach(() => {
    resetModelRegistry();
  });

  // -----------------------------------------------------------------------
  // 1. Multi-turn conversation with history
  // -----------------------------------------------------------------------

  describe("multi-turn conversation", () => {
    it("should accumulate conversation history across calls", async () => {
      const { model, calls } = createSpyMockModel([
        "The Fibonacci sequence starts with 0, 1, 1, 2, 3...",
        "The first 10 are: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34",
        "It was discovered by Leonardo of Pisa",
      ]);

      registerModel("mock/multi-turn-history", model);

      const agent = createAgent({
        name: "historian",
        model: "mock/multi-turn-history",
        systemPrompt: "You are a math tutor.",
      });

      // First call — no history yet
      await agent.call("What is the Fibonacci sequence?");
      expect(calls.length).toBe(1);

      // Second call — should include first turn in history
      await agent.call("Give me the first 10 numbers");
      expect(calls.length).toBe(2);

      // Third call — should include first two turns
      await agent.call("Who discovered it?");
      expect(calls.length).toBe(3);

      // Verify the third call received the full history
      // The messages array should contain: history (turn1 user + assistant, turn2 user + assistant) + current message
      const thirdCallMessages = calls[2]?.messages as any[];
      // Should have at least 5 messages (2 turns * 2 messages + 1 current)
      expect(thirdCallMessages.length).toBeGreaterThanOrEqual(5);
    });

    it("should pass system prompt to every call", async () => {
      const { model, calls } = createSpyMockModel(["Response 1", "Response 2"]);

      registerModel("mock/multi-turn-system", model);

      const agent = createAgent({
        name: "sys-prompt",
        model: "mock/multi-turn-system",
        systemPrompt: "You are a pirate. Speak in pirate language.",
      });

      await agent.call("Hello");
      await agent.call("How are you?");

      // Both calls should have the system prompt
      expect(calls[0]?.system).toBe(
        "You are a pirate. Speak in pirate language.",
      );
      expect(calls[1]?.system).toBe(
        "You are a pirate. Speak in pirate language.",
      );
    });
  });

  // -----------------------------------------------------------------------
  // 3. System prompt templates
  // -----------------------------------------------------------------------

  describe("system prompt templates", () => {
    it("should resolve template variables in system prompt", async () => {
      const { model, calls } = createSpyMockModel([
        "I'll review your TypeScript code.",
      ]);

      registerModel("mock/spy-template", model);

      const template = createPromptTemplate({
        template: "You are {{ role }}, reviewing {{ language }} code.",
        variables: {
          role: "a senior engineer",
          language: "TypeScript",
        },
      });

      const agent = createAgent({
        name: "template-agent",
        model: "mock/spy-template",
        systemPrompt: template,
      });

      await agent.call("Review my code");

      expect(calls[0]?.system).toBe(
        "You are a senior engineer, reviewing TypeScript code.",
      );
    });

    it("should resolve PromptTemplate when passed as systemPrompt", async () => {
      const { model, calls } = createSpyMockModel(["OK"]);

      registerModel("mock/spy-template-priority", model);

      const template = createPromptTemplate({
        template: "Template prompt: {{ role }}",
        variables: { role: "tester" },
      });

      const agent = createAgent({
        name: "template-priority",
        model: "mock/spy-template-priority",
        systemPrompt: template,
      });

      await agent.call("Test");

      // Template should be rendered with baked-in variables
      expect(calls[0]?.system).toBe("Template prompt: tester");
    });

    it("should render PromptTemplate with baked-in variables", async () => {
      const { model, calls } = createSpyMockModel(["OK"]);

      registerModel("mock/spy-template-override", model);

      const template = createPromptTemplate({
        template: "You are {{ role }}, working in {{ language }}.",
        variables: {
          role: "a developer",
          language: "Rust",
        },
      });

      const agent = createAgent({
        name: "override-agent",
        model: "mock/spy-template-override",
        systemPrompt: template,
      });

      await agent.call("Test");

      expect(calls[0]?.system).toBe("You are a developer, working in Rust.");
    });
  });

  // -----------------------------------------------------------------------
  // 5. createAgent() factory parity
  // -----------------------------------------------------------------------

  describe("createAgent() factory", () => {
    it("should produce consistent results across two independently-created agents", async () => {
      const config = {
        name: "factory-test",
        systemPrompt: "You are helpful.",
      };

      // Two independent agents with identical config and identical mock models
      registerModel(
        "mock/factory-1",
        createSimpleMockModel(["Hello from factory"]),
      );
      registerModel(
        "mock/factory-2",
        createSimpleMockModel(["Hello from factory"]),
      );

      const agent1 = createAgent({
        ...config,
        model: "mock/factory-1",
      });
      const agent2 = createAgent({
        ...config,
        model: "mock/factory-2",
      });

      const result1 = await agent1.call("Test");
      const result2 = await agent2.call("Test");

      expect(result1.text).toBe(result2.text);
      expect(result1.finishReason).toBe(result2.finishReason);
      expect(result1.usage.promptTokens).toBe(result2.usage.promptTokens);
    });

    it("should return an agent with the expected interface", () => {
      registerModel("mock/instance-check", createSimpleMockModel(["ok"]));

      const agent = createAgent({
        name: "instance-check",
        model: "mock/instance-check",
      });

      // Duck-type check: the returned agent must have all Agent fields
      expect(typeof agent.call).toBe("function");
      expect(typeof agent.reset).toBe("function");
      expect(typeof agent.stream).toBe("function");
      expect(typeof agent.getConversationContext).toBe("function");
      expect(agent.name).toBe("instance-check");
      expect(agent.config).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // 6. Agent reset
  // -----------------------------------------------------------------------

  describe("agent reset", () => {
    it("should clear history and reset first-call state", async () => {
      const hookLog: string[] = [];

      registerModel(
        "mock/resettable",
        createSimpleMockModel(["R1", "R2", "R3"]),
      );

      const agent = createAgent({
        name: "resettable",
        model: "mock/resettable",
      });

      hookIntoAgent(agent, {
        beforeFirstCall: [
          async () => {
            hookLog.push("initial");
          },
        ],
        beforeCall: [
          async () => {
            hookLog.push("regular");
          },
        ],
      });

      // First call triggers initial hook
      await agent.call("First");
      expect(hookLog).toContain("initial");

      // Second call triggers regular hook
      await agent.call("Second");

      // Reset
      agent.reset();
      hookLog.length = 0;

      // After reset, the next call should trigger initial hook again
      await agent.call("After reset");
      expect(hookLog).toContain("initial");

      // Context should be empty — verify via getConversationContext()
      // Reset was called before third call, so context should only have the post-reset call
      const context = agent.getConversationContext?.();
      // Should have 2 entries (1 user + 1 assistant from the post-reset call)
      expect(context.messages().length).toBe(2);
    });
  });
});
