import { describe, expect, it } from "bun:test";
import type { ConversationTurn } from "../../context/conversation-context.types";
import { loadStrategyFromString } from "./loader";

const SIMPLE_STRATEGY = JSON.stringify({
  name: "SimpleReplay",
  version: "1.0",
  agents: {
    writer: {
      model: "openai/gpt-4o",
      systemPrompt: "Write something.",
    },
  },
  flow: {
    name: "Main",
    type: "sequential",
    steps: [{ agent: "writer" }],
  },
});

const makeTurn = (
  userText: string,
  assistantText: string,
): ConversationTurn => {
  return {
    agentName: "writer",
    userMessage: { role: "user", content: userText },
    responseMessages: [
      { role: "assistant", content: [{ type: "text", text: assistantText }] },
    ],
  };
};

describe("Loader Replay integration", () => {
  it("should hydrate agents from initialAgentTurns option and replay flow", async () => {
    // 1. Prepare turns
    const turns = [makeTurn("Hello", "Replayed Output")];
    const initialAgentTurns = new Map<string, readonly ConversationTurn[]>([
      ["writer", turns],
    ]);

    // 2. Load strategy
    const loaded = await loadStrategyFromString(SIMPLE_STRATEGY, "json", {
      initialAgentTurns,
    });

    const agent = loaded.agents.writer;
    expect(agent).toBeDefined();
    expect(agent?.getConversationContext?.().length).toBe(1);

    // 3. Execute flow. Since the agent has 1 replayed turn, this should execute
    // with no real LLM call and return "Replayed Output".
    const res = await loaded.flow.call("Hello");
    expect(res.text).toBe("Replayed Output");
  });
});
