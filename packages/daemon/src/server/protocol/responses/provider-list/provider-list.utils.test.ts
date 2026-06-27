import { describe, expect, it } from "bun:test";
import { toModelInfoWire } from "./provider-list.utils";

describe("toModelInfoWire", () => {
  it("copies the complete Core model contract into the wire contract", () => {
    const wire = toModelInfoWire({
      id: "model",
      name: "Model",
      family: "family",
      contextWindow: 128_000,
      maxInputTokens: 120_000,
      maxOutputTokens: 8_000,
      knowledgeCutoff: "2025-01",
      releaseDate: "2025-02-01",
      lastUpdated: "2025-03-01",
      status: "beta",
      modalities: { input: ["text"], output: ["text"] },
      capabilities: {
        tools: true,
        reasoning: false,
        vision: false,
        attachment: false,
        structuredOutput: true,
      },
      cost: { input: 1, output: 2 },
    });

    expect(wire).toEqual({
      id: "model",
      name: "Model",
      family: "family",
      contextWindow: 128_000,
      maxInputTokens: 120_000,
      maxOutputTokens: 8_000,
      knowledgeCutoff: "2025-01",
      releaseDate: "2025-02-01",
      lastUpdated: "2025-03-01",
      status: "beta",
      modalities: { input: ["text"], output: ["text"] },
      capabilities: {
        tools: true,
        reasoning: false,
        vision: false,
        attachment: false,
        structuredOutput: true,
      },
      cost: { input: 1, output: 2 },
    });
  });

  it("omits optional fields instead of synthesizing defaults", () => {
    expect(toModelInfoWire({ id: "minimal" })).toEqual({ id: "minimal" });
  });
});
