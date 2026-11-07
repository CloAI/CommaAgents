import { describe, expect, it } from "bun:test";
import { MissingModelRolesError } from "../../errors/index";
import { StrategySchema } from "../../strategy/schema";
import {
  findMissingModelRoles,
  getModelFamily,
  resolveModelReference,
} from "./roles";

describe("resolveModelReference", () => {
  it("should return plain model identifiers unchanged", () => {
    expect(resolveModelReference("openai/gpt-5", {})).toBe("openai/gpt-5");
  });

  it("should prefer configured roles over strategy defaults", () => {
    expect(
      resolveModelReference("@medium", {
        configured: { medium: "anthropic/claude-opus-5-5" },
        defaults: { medium: "openai/gpt-5" },
      }),
    ).toBe("anthropic/claude-opus-5-5");
  });

  it("should use the strategy default when no role is configured", () => {
    expect(
      resolveModelReference("@medium", {
        defaults: { medium: "openai/gpt-5" },
      }),
    ).toBe("openai/gpt-5");
  });

  it("should not fall back to another role", () => {
    expect(() =>
      resolveModelReference("@simple", {
        configured: { medium: "openai/gpt-5" },
      }),
    ).toThrow(MissingModelRolesError);
  });
});

describe("findMissingModelRoles", () => {
  const strategy = StrategySchema.parse({
    name: "Test",
    version: "1.0",
    modelRoles: { simple: "openai/gpt-5-mini" },
    agents: {
      user: { type: "user" },
      main: {
        model: "@medium",
        context: { compaction: { model: "@compaction" } },
      },
      helper: { model: "@simple" },
      fixed: { model: "openai/gpt-5" },
    },
    flow: { name: "Main", type: "sequential", steps: [{ agent: "main" }] },
  });

  it("should list referenced roles that nothing defines", () => {
    expect(findMissingModelRoles(strategy, { configured: {} })).toEqual([
      "medium",
      "compaction",
    ]);
  });

  it("should count configured roles and strategy defaults as defined", () => {
    expect(
      findMissingModelRoles(strategy, {
        configured: { medium: "openai/gpt-5", compaction: "openai/gpt-5-mini" },
      }),
    ).toEqual([]);
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
