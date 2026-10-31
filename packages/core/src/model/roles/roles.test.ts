import { describe, expect, it } from "bun:test";
import { getModelFamily, resolveModelReference } from "./roles";

describe("resolveModelReference", () => {
  it("should return plain model identifiers unchanged", () => {
    expect(resolveModelReference("openai/gpt-5", {})).toBe("openai/gpt-5");
  });

  it("should prefer configured roles over strategy defaults", () => {
    expect(
      resolveModelReference("@primary", {
        configured: { primary: "anthropic/claude-opus-5-5" },
        defaults: { primary: "openai/gpt-5" },
      }),
    ).toBe("anthropic/claude-opus-5-5");
  });

  it("should follow the fallback chain from compaction to primary", () => {
    expect(
      resolveModelReference("@compaction", {
        defaults: { primary: "openai/gpt-5" },
      }),
    ).toBe("openai/gpt-5");
  });

  it("should stop at the first role in the chain that has a model", () => {
    expect(
      resolveModelReference("@compaction", {
        configured: { subagent: "openai/gpt-5-mini" },
        defaults: { primary: "openai/gpt-5" },
      }),
    ).toBe("openai/gpt-5-mini");
  });

  it("should fall back to primary for unknown roles", () => {
    expect(
      resolveModelReference("@research", {
        defaults: { primary: "openai/gpt-5" },
      }),
    ).toBe("openai/gpt-5");
  });

  it("should name every tried role when nothing resolves", () => {
    expect(() => resolveModelReference("@fast", {})).toThrow(
      'Model role "@fast" has no model. Tried roles: fast → subagent → primary.',
    );
  });
});

describe("getModelFamily", () => {
  it("should classify common model identifiers", () => {
    expect(getModelFamily("anthropic/claude-opus-5-5")).toBe("claude");
    expect(getModelFamily("openai/gpt-5")).toBe("gpt");
    expect(getModelFamily("openai/o4-mini")).toBe("gpt");
    expect(getModelFamily("openrouter/google/gemma-4-26b-a4b-it")).toBe(
      "gemini",
    );
    expect(getModelFamily("openrouter/qwen/qwen3-coder")).toBe("other");
  });
});
