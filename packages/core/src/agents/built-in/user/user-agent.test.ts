// Tests for createUserAgent factory

import { describe, expect, it } from "bun:test";
import { hookIntoAgent } from "../../hook-into-agent/hook-into-agent";
import type { InputCollector, InputRequest } from "./user-agent";
import { createUserAgent } from "./user-agent";

// Helpers

/** Creates a mock InputCollector that returns predetermined responses. */
function createMockCollector(responses: string[]): InputCollector {
  let callIndex = 0;
  return async (_request: InputRequest): Promise<string> => {
    const response =
      responses[callIndex] ?? responses[responses.length - 1] ?? "";
    callIndex++;
    return response;
  };
}

// Tests

describe("createUserAgent", () => {
  describe("basic properties", () => {
    it("should return an Agent with the configured name", () => {
      const agent = createUserAgent({ name: "user-agent" });
      expect(agent.name).toBe("user-agent");
    });

    it("should have call and reset methods", () => {
      const agent = createUserAgent({ name: "user" });
      expect(typeof agent.call).toBe("function");
      expect(typeof agent.reset).toBe("function");
    });
  });

  describe("requireInput mode", () => {
    it("should call the inputCollector and return user input", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: true,
        inputCollector: createMockCollector(["user response"]),
      });

      const result = await agent.call("Please provide input:");
      expect(result.text).toBe("user response");
    });

    it("should default requireInput to true", async () => {
      const agent = createUserAgent({
        name: "user",
        inputCollector: createMockCollector(["from user"]),
      });

      const result = await agent.call("prompt");
      expect(result.text).toBe("from user");
    });

    it("should pass InputRequest with agentName to collector", async () => {
      const receivedRequests: InputRequest[] = [];
      const collector: InputCollector = async (request: InputRequest) => {
        receivedRequests.push(request);
        return "response";
      };

      const agent = createUserAgent({
        name: "my-agent",
        requireInput: true,
        inputCollector: collector,
      });

      await agent.call("What should we do?");

      expect(receivedRequests).toHaveLength(1);
      expect(receivedRequests[0]?.agentName).toBe("my-agent");
      expect(receivedRequests[0]?.prompt).toBe("What should we do?");
    });

    it("should call collector multiple times for multiple calls", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: true,
        inputCollector: createMockCollector(["first", "second", "third"]),
      });

      const r1 = await agent.call("prompt1");
      const r2 = await agent.call("prompt2");
      const r3 = await agent.call("prompt3");

      expect(r1.text).toBe("first");
      expect(r2.text).toBe("second");
      expect(r3.text).toBe("third");
    });
  });

  describe("preset mode", () => {
    it("should return presetMessage when requireInput is false", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "Please review the code above.",
      });

      const result = await agent.call("some input");
      expect(result.text).toBe("Please review the code above.");
    });

    it("should pass through the incoming message when no presetMessage", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
      });

      const result = await agent.call("incoming message");
      expect(result.text).toBe("incoming message");
    });

    it("should not call inputCollector when requireInput is false", async () => {
      let collectorCalled = false;
      const collector: InputCollector = async () => {
        collectorCalled = true;
        return "should not appear";
      };

      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
        inputCollector: collector,
      });

      await agent.call("test");
      expect(collectorCalled).toBe(false);
    });
  });

  describe("result shape", () => {
    it("should include synthetic LLM-shaped fields (steps, responseMessages)", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "msg",
      });

      const result = await agent.call("test");
      expect("steps" in result).toBe(true);
      expect("responseMessages" in result).toBe(true);
      // steps is empty — no LLM round-trips occurred
      expect((result as any).steps).toEqual([]);
      // responseMessages contains the synthetic assistant message
      expect((result as any).responseMessages).toEqual([
        { role: "assistant", content: "msg" },
      ]);
    });

    it("should return zero token usage", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "msg",
      });

      const result = await agent.call("test");
      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
    });

    it("should return 'stop' as finishReason", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "msg",
      });

      const result = await agent.call("test");
      expect(result.finishReason).toBe("stop");
    });
  });

  describe("hooks via hookIntoAgent", () => {
    it("should run alterCallMessage hooks", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
      });

      hookIntoAgent(agent, {
        alterCallMessage: [(message) => `[altered] ${message}`],
      });

      // With no presetMessage and requireInput=false, the altered message is passed through
      const result = await agent.call("original");
      expect(result.text).toBe("[altered] original");
    });

    it("should run alterResponse hooks", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "raw",
      });

      hookIntoAgent(agent, {
        alterResponse: [(response) => `[processed] ${response}`],
      });

      const result = await agent.call("test");
      expect(result.text).toBe("[processed] raw");
    });

    it("should chain multiple transform hooks", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
      });

      hookIntoAgent(agent, {
        alterCallMessage: [
          (message) => `A:${message}`,
          (message) => `B:${message}`,
        ],
      });

      const result = await agent.call("start");
      expect(result.text).toBe("B:A:start");
    });

    it("should run beforeCall and afterCallResult side-effect hooks", async () => {
      const calls: string[] = [];

      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
      });

      hookIntoAgent(agent, {
        beforeCall: [
          () => {
            calls.push("before");
          },
        ],
        afterCallResult: [
          () => {
            calls.push("after");
          },
        ],
      });

      await agent.call("test");
      expect(calls).toEqual(["before", "after"]);
    });

    it("should use initial hooks on first call and regular hooks after", async () => {
      const calls: string[] = [];

      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
      });

      hookIntoAgent(agent, {
        beforeFirstCall: [
          () => {
            calls.push("initial-before");
          },
        ],
        beforeCall: [
          () => {
            calls.push("regular-before");
          },
        ],
      });

      await agent.call("first");
      expect(calls).toEqual(["initial-before"]);

      calls.length = 0;
      await agent.call("second");
      expect(calls).toEqual(["regular-before"]);
    });

    it("should fall back to base hooks when initial hooks are undefined", async () => {
      const calls: string[] = [];

      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
      });

      hookIntoAgent(agent, {
        beforeCall: [
          () => {
            calls.push("base-before");
          },
        ],
      });

      await agent.call("first");
      expect(calls).toEqual(["base-before"]);
    });

    it("should use alterFirstCallMessage on first call", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
      });

      hookIntoAgent(agent, {
        alterFirstCallMessage: [(message) => `[initial] ${message}`],
        alterCallMessage: [(message) => `[regular] ${message}`],
      });

      const r1 = await agent.call("msg");
      expect(r1.text).toBe("[initial] msg");

      const r2 = await agent.call("msg");
      expect(r2.text).toBe("[regular] msg");
    });

    it("should use alterFirstResponse on first call", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
      });

      hookIntoAgent(agent, {
        alterFirstResponse: [(response) => `[initial] ${response}`],
        alterResponse: [(response) => `[regular] ${response}`],
      });

      const r1 = await agent.call("msg");
      expect(r1.text).toBe("[initial] preset");

      const r2 = await agent.call("msg");
      expect(r2.text).toBe("[regular] preset");
    });

    it("should pass altered message to inputCollector", async () => {
      const receivedPrompts: string[] = [];
      const collector: InputCollector = async (request: InputRequest) => {
        receivedPrompts.push(request.prompt);
        return "response";
      };

      const agent = createUserAgent({
        name: "user",
        requireInput: true,
        inputCollector: collector,
      });

      hookIntoAgent(agent, {
        alterCallMessage: [(message) => `[prefix] ${message}`],
      });

      await agent.call("original");
      expect(receivedPrompts).toEqual(["[prefix] original"]);
    });
  });

  describe("reset", () => {
    it("should reset first-call state", async () => {
      const calls: string[] = [];

      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
      });

      hookIntoAgent(agent, {
        beforeFirstCall: [
          () => {
            calls.push("initial");
          },
        ],
        beforeCall: [
          () => {
            calls.push("regular");
          },
        ],
      });

      await agent.call("first");
      expect(calls).toEqual(["initial"]);

      agent.reset();
      calls.length = 0;

      await agent.call("after-reset");
      expect(calls).toEqual(["initial"]);
    });
  });
});
