import { afterEach, describe, expect, it } from "bun:test";
import { defaultInputCollector } from "./user-agent.utils";

const originalPrompt = globalThis.prompt;

afterEach(() => {
  globalThis.prompt = originalPrompt;
});

describe("defaultInputCollector", () => {
  it("passes the request prompt to the global prompt function", async () => {
    let receivedPrompt: string | undefined;
    globalThis.prompt = (message?: string) => {
      receivedPrompt = message;
      return "answer";
    };

    const result = await defaultInputCollector({
      agentName: "user",
      prompt: "Question?",
    });

    expect(result).toBe("answer");
    expect(receivedPrompt).toBe("Question?");
  });

  it("returns an empty string when the global prompt is cancelled", async () => {
    globalThis.prompt = () => null;

    const result = await defaultInputCollector({
      agentName: "user",
      prompt: "Question?",
    });

    expect(result).toBe("");
  });
});
