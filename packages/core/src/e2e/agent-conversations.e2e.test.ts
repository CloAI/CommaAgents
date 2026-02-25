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
 *   - createAgent() factory parity with new BaseAgent()
 *   - Agent reset behavior
 *
 * All tests use mock models — no API keys required.
 */

import { describe, expect, it } from "bun:test";
import { BaseAgent, createAgent } from "../agents/base-agent";
import { createPromptTemplate } from "../prompts/template/prompt-template";
import { createSimpleMockModel, createSpyMockModel } from "./helpers/mock-model";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E2E: Agent Conversations", () => {
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

      const agent = createAgent({
        name: "historian",
        model,
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
      const thirdCallMessages = calls[2].messages as any[];
      // Should have at least 5 messages (2 turns * 2 messages + 1 current)
      expect(thirdCallMessages.length).toBeGreaterThanOrEqual(5);
    });

    it("should pass system prompt to every call", async () => {
      const { model, calls } = createSpyMockModel(["Response 1", "Response 2"]);

      const agent = createAgent({
        name: "sys-prompt",
        model,
        systemPrompt: "You are a pirate. Speak in pirate language.",
      });

      await agent.call("Hello");
      await agent.call("How are you?");

      // Both calls should have the system prompt
      expect(calls[0].system).toBe("You are a pirate. Speak in pirate language.");
      expect(calls[1].system).toBe("You are a pirate. Speak in pirate language.");
    });
  });

  // -----------------------------------------------------------------------
  // 2. History windowing (maxTurns)
  // -----------------------------------------------------------------------

  describe("history windowing", () => {
    it("should truncate history to maxTurns", async () => {
      const { model, calls } = createSpyMockModel([
        "Response 1",
        "Response 2",
        "Response 3",
        "Response 4",
        "Response 5",
      ]);

      const agent = createAgent({
        name: "windowed",
        model,
        historyConfig: { maxTurns: 2 },
      });

      // Make 4 calls to build up history
      await agent.call("Message 1");
      await agent.call("Message 2");
      await agent.call("Message 3");
      await agent.call("Message 4");

      // 5th call — history should only contain last 2 turns
      await agent.call("Message 5");

      const lastCallMessages = calls[4].messages as any[];
      // Should have: 2 history turns (4 messages) + 1 current message = 5 messages
      // NOT 4 history turns (8 messages) + 1 current message
      expect(lastCallMessages.length).toBeLessThanOrEqual(5);
    });
  });

  // -----------------------------------------------------------------------
  // 3. System prompt templates
  // -----------------------------------------------------------------------

  describe("system prompt templates", () => {
    it("should resolve template variables in system prompt", async () => {
      const { model, calls } = createSpyMockModel(["I'll review your TypeScript code."]);

      const template = createPromptTemplate({
        template: "You are {role}, reviewing {language} code.",
        variables: {
          role: "a senior engineer",
          language: "TypeScript",
        },
      });

      const agent = createAgent({
        name: "template-agent",
        model,
        systemPromptTemplate: template,
      });

      await agent.call("Review my code");

      expect(calls[0].system).toBe("You are a senior engineer, reviewing TypeScript code.");
    });

    it("should prefer template over static systemPrompt", async () => {
      const { model, calls } = createSpyMockModel(["OK"]);

      const template = createPromptTemplate({
        template: "Template prompt: {role}",
        variables: { role: "tester" },
      });

      const agent = createAgent({
        name: "template-priority",
        model,
        systemPrompt: "Static prompt (should be ignored)",
        systemPromptTemplate: template,
      });

      await agent.call("Test");

      // Template should take priority
      expect(calls[0].system).toBe("Template prompt: tester");
    });

    it("should apply templateOverrides to override base variables", async () => {
      const { model, calls } = createSpyMockModel(["OK"]);

      const template = createPromptTemplate({
        template: "You are {role}, working in {language}.",
        variables: {
          role: "a developer",
          language: "JavaScript",
        },
      });

      const agent = createAgent({
        name: "override-agent",
        model,
        systemPromptTemplate: template,
        templateOverrides: {
          language: "Rust", // Override only language, keep role
        },
      });

      await agent.call("Test");

      expect(calls[0].system).toBe("You are a developer, working in Rust.");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Prefix messages (few-shot examples)
  // -----------------------------------------------------------------------

  describe("prefix messages", () => {
    it("should prepend prefix messages before conversation history", async () => {
      const { model, calls } = createSpyMockModel(["Paris"]);

      const agent = createAgent({
        name: "few-shot",
        model,
        prefixMessages: [
          { role: "user", content: "What is the capital of Germany?" },
          { role: "assistant", content: "Berlin" },
          { role: "user", content: "What is the capital of Japan?" },
          { role: "assistant", content: "Tokyo" },
        ],
      });

      await agent.call("What is the capital of France?");

      const messages = calls[0].messages as any[];
      // Should have: 4 prefix messages + 1 current message = 5
      expect(messages.length).toBe(5);

      // First messages should be the few-shot examples
      // Note: AI SDK converts string content to structured [{type:"text", text:"..."}]
      expect(messages[0].role).toBe("user");
      const firstContent = messages[0].content;
      const firstText =
        typeof firstContent === "string"
          ? firstContent
          : firstContent.map((p: any) => p.text).join("");
      expect(firstText).toContain("Germany");
      expect(messages[1].role).toBe("assistant");
      const secondContent = messages[1].content;
      const secondText =
        typeof secondContent === "string"
          ? secondContent
          : secondContent.map((p: any) => p.text).join("");
      expect(secondText).toContain("Berlin");
    });

    it("should preserve prefix messages across multiple calls", async () => {
      const { model, calls } = createSpyMockModel(["Paris", "Madrid"]);

      const agent = createAgent({
        name: "few-shot-multi",
        model,
        prefixMessages: [
          { role: "user", content: "Example question" },
          { role: "assistant", content: "Example answer" },
        ],
      });

      await agent.call("Question 1");
      await agent.call("Question 2");

      // Both calls should start with prefix messages
      // Note: AI SDK converts string content to structured [{type:"text", text:"..."}]
      const firstMessages = calls[0].messages as any[];
      const secondMessages = calls[1].messages as any[];

      function extractText(content: any): string {
        if (typeof content === "string") return content;
        return content.map((p: any) => p.text).join("");
      }

      expect(extractText(firstMessages[0].content)).toContain("Example question");
      expect(extractText(secondMessages[0].content)).toContain("Example question");

      // Second call should also have the first turn in history (after prefix)
      expect(secondMessages.length).toBeGreaterThan(firstMessages.length);
    });
  });

  // -----------------------------------------------------------------------
  // 5. createAgent() factory parity
  // -----------------------------------------------------------------------

  describe("createAgent() factory", () => {
    it("should produce identical behavior to new BaseAgent()", async () => {
      const config = {
        name: "factory-test",
        model: createSimpleMockModel(["Hello from factory"]),
        systemPrompt: "You are helpful.",
      };

      // Using factory
      const factoryAgent = createAgent({ ...config });
      // Using class directly
      const classAgent = new BaseAgent({
        ...config,
        model: createSimpleMockModel(["Hello from factory"]),
      });

      const factoryResult = await factoryAgent.call("Test");
      const classResult = await classAgent.call("Test");

      expect(factoryResult.text).toBe(classResult.text);
      expect(factoryResult.finishReason).toBe(classResult.finishReason);
      expect(factoryResult.usage.promptTokens).toBe(classResult.usage.promptTokens);
    });

    it("should return a BaseAgent instance", () => {
      const agent = createAgent({
        name: "instance-check",
        model: createSimpleMockModel(["ok"]),
      });

      expect(agent).toBeInstanceOf(BaseAgent);
      expect(agent.name).toBe("instance-check");
    });
  });

  // -----------------------------------------------------------------------
  // 6. Agent reset
  // -----------------------------------------------------------------------

  describe("agent reset", () => {
    it("should clear history and reset first-call state", async () => {
      const hookLog: string[] = [];

      const agent = createAgent({
        name: "resettable",
        model: createSimpleMockModel(["R1", "R2", "R3"]),
        hooks: {
          beforeInitialCall: [
            async () => {
              hookLog.push("initial");
            },
          ],
          beforeCall: [
            async () => {
              hookLog.push("regular");
            },
          ],
        },
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

      // History should be empty — verify via getHistory()
      // Reset was called before third call, so history should only have the post-reset call
      const history = agent.getHistory();
      // Should have 2 entries (1 user + 1 assistant from the post-reset call)
      expect(history.length).toBe(2);
    });
  });
});
