import { describe, expect, it } from "bun:test";
import { resolveAgentModelDetails } from "./agent-model-details";

describe("resolveAgentModelDetails", () => {
  it("returns an empty object when no model is configured", () => {
    expect(resolveAgentModelDetails(undefined)).toEqual({});
  });

  it("preserves an unknown model without inventing metadata", () => {
    expect(resolveAgentModelDetails("unknown/model")).toEqual({
      model: "unknown/model",
    });
  });

  it("includes context-window metadata for catalog models", () => {
    expect(resolveAgentModelDetails("openai/gpt-4o")).toEqual({
      model: "openai/gpt-4o",
      contextWindow: 128_000,
    });
  });
});
