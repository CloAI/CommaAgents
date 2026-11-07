import { afterEach, describe, expect, it } from "vitest";
import { defaultInputCollector } from "./user-agent.utils";

const promptGlobal = globalThis as typeof globalThis & { prompt?: (message?: string) => string | null };
const originalPrompt = promptGlobal.prompt;

afterEach(() => {
  promptGlobal.prompt = originalPrompt;
});

describe("defaultInputCollector", () => {
  it("passes the request prompt to the global prompt function", async () => {
    let receivedPrompt: string | undefined;
    promptGlobal.prompt = (message?: string) => {
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
    promptGlobal.prompt = () => null;

    const result = await defaultInputCollector({
      agentName: "user",
      prompt: "Question?",
    });

    expect(result).toBe("");
  });
});
