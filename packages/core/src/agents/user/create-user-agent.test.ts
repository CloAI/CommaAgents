// Tests for createUserAgent factory

import { describe, expect, it } from "bun:test";
import type { InputCollector, InputRequest } from "./create-user-agent";
import { createUserAgent } from "./create-user-agent";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock InputCollector that returns predetermined responses. */
function createMockCollector(responses: string[]): InputCollector {
  let callIndex = 0;
  return async (_request: InputRequest): Promise<string> => {
    const response = responses[callIndex] ?? responses[responses.length - 1] ?? "";
    callIndex++;
    return response;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    it("should pass AbortSignal to collector when configured", async () => {
      const receivedRequests: InputRequest[] = [];
      const collector: InputCollector = async (request: InputRequest) => {
        receivedRequests.push(request);
        return "response";
      };

      const controller = new AbortController();
      const agent = createUserAgent({
        name: "user",
        requireInput: true,
        inputCollector: collector,
        abort: controller.signal,
      });

      await agent.call("prompt");

      expect(receivedRequests[0]?.signal).toBe(controller.signal);
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
    it("should return empty steps array", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "msg",
      });

      const result = await agent.call("test");
      expect(result.steps).toEqual([]);
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

  describe("hooks", () => {
    it("should run alterCallMessage hooks", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        hooks: {
          alterCallMessage: [(msg) => `[altered] ${msg}`],
        },
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
        hooks: {
          alterResponse: [(resp) => `[processed] ${resp}`],
        },
      });

      const result = await agent.call("test");
      expect(result.text).toBe("[processed] raw");
    });

    it("should chain multiple transform hooks", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        hooks: {
          alterCallMessage: [(msg) => `A:${msg}`, (msg) => `B:${msg}`],
        },
      });

      const result = await agent.call("start");
      expect(result.text).toBe("B:A:start");
    });

    it("should run beforeCall and afterCall side-effect hooks", async () => {
      const calls: string[] = [];

      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
        hooks: {
          beforeCall: [
            () => {
              calls.push("before");
            },
          ],
          afterCall: [
            () => {
              calls.push("after");
            },
          ],
        },
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
        hooks: {
          beforeInitialCall: [
            () => {
              calls.push("initial-before");
            },
          ],
          beforeCall: [
            () => {
              calls.push("regular-before");
            },
          ],
        },
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
        hooks: {
          beforeCall: [
            () => {
              calls.push("base-before");
            },
          ],
        },
      });

      await agent.call("first");
      expect(calls).toEqual(["base-before"]);
    });

    it("should use alterInitialCallMessage on first call", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        hooks: {
          alterInitialCallMessage: [(msg) => `[initial] ${msg}`],
          alterCallMessage: [(msg) => `[regular] ${msg}`],
        },
      });

      const r1 = await agent.call("msg");
      expect(r1.text).toBe("[initial] msg");

      const r2 = await agent.call("msg");
      expect(r2.text).toBe("[regular] msg");
    });

    it("should use alterInitialResponse on first call", async () => {
      const agent = createUserAgent({
        name: "user",
        requireInput: false,
        presetMessage: "preset",
        hooks: {
          alterInitialResponse: [(r) => `[initial] ${r}`],
          alterResponse: [(r) => `[regular] ${r}`],
        },
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
        hooks: {
          alterCallMessage: [(msg) => `[prefix] ${msg}`],
        },
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
        hooks: {
          beforeInitialCall: [
            () => {
              calls.push("initial");
            },
          ],
          beforeCall: [
            () => {
              calls.push("regular");
            },
          ],
        },
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
