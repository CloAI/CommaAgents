import { describe, expect, it } from "bun:test";
import type { Strategy } from "@comma-agents/core";
import { applyOverrides } from "./overrides";

function baseStrategy(): Strategy {
  return {
    name: "Test",
    version: "1.0",
    agents: {
      user: { type: "user", config: { requireInput: true } },
      assistant: {
        model: "openai/gpt-4o",
        systemPrompt: "You are helpful.",
      },
      templated: {
        model: "openai/gpt-4o",
        systemPromptTemplate: {
          template: "You are {{ role }}.",
          variables: { role: "a reviewer" },
        },
      },
    },
    flow: {
      name: "Main",
      type: "sequential",
      steps: [{ agent: "user" }, { agent: "assistant" }],
    },
  } as Strategy;
}

describe("applyOverrides", () => {
  it("replaces a system prompt without mutating the base", () => {
    const base = baseStrategy();
    const result = applyOverrides(base, [
      { agentName: "assistant", systemPrompt: "New prompt." },
    ]);

    const resultAssistant = result.agents.assistant;
    const baseAssistant = base.agents.assistant;
    expect(resultAssistant).toBeDefined();
    expect(baseAssistant).toBeDefined();
    if (!resultAssistant || "type" in resultAssistant) throw new Error("llm");
    if (!baseAssistant || "type" in baseAssistant) throw new Error("llm");

    expect(resultAssistant.systemPrompt).toBe("New prompt.");
    // Base is untouched.
    expect(baseAssistant.systemPrompt).toBe("You are helpful.");
  });

  it("appends to an existing system prompt", () => {
    const result = applyOverrides(baseStrategy(), [
      { agentName: "assistant", appendToSystemPrompt: "Be concise." },
    ]);
    const agent = result.agents.assistant;
    if (!agent || "type" in agent) throw new Error("llm");
    expect(agent.systemPrompt).toBe("You are helpful.\n\nBe concise.");
  });

  it("merges template variables", () => {
    const result = applyOverrides(baseStrategy(), [
      { agentName: "templated", templateVariables: { role: "an expert" } },
    ]);
    const agent = result.agents.templated;
    if (!agent || "type" in agent) throw new Error("llm");
    expect(agent.systemPromptTemplate?.variables).toEqual({
      role: "an expert",
    });
  });

  it("applies multiple overrides in order", () => {
    const result = applyOverrides(baseStrategy(), [
      { agentName: "assistant", systemPrompt: "Base." },
      { agentName: "assistant", appendToSystemPrompt: "Extra." },
    ]);
    const agent = result.agents.assistant;
    if (!agent || "type" in agent) throw new Error("llm");
    expect(agent.systemPrompt).toBe("Base.\n\nExtra.");
  });

  it("throws on unknown agent", () => {
    expect(() =>
      applyOverrides(baseStrategy(), [
        { agentName: "missing", systemPrompt: "x" },
      ]),
    ).toThrow(/unknown agent/);
  });

  it("throws when targeting a user agent", () => {
    expect(() =>
      applyOverrides(baseStrategy(), [
        { agentName: "user", systemPrompt: "x" },
      ]),
    ).toThrow(/user agent/);
  });

  it("throws on templateVariables without a template", () => {
    expect(() =>
      applyOverrides(baseStrategy(), [
        { agentName: "assistant", templateVariables: { role: "x" } },
      ]),
    ).toThrow(/no systemPromptTemplate/);
  });
});
