// Tests for buildToolSystemPrompt helper

import { describe, expect, it } from "bun:test";
import {
  buildToolSystemPrompt,
  mergeSystemPrompts,
} from "./build-tool-system-prompt";
import type { ToolContext, ToolDefinition } from "./tool.types";

describe("buildToolSystemPrompt", () => {
  // Minimal ToolContext for testing
  const mockToolContext: ToolContext = {
    agentName: "test-agent",
    abort: new AbortController().signal,
    guard: {
      toolName: "test",
      cwd: "/test",
      authorize: async () => "/test",
      canAccess: () => true,
      addPolicy: () => {},
      removePolicy: () => false,
      getPolicies: () => ({ toolName: "test", policies: [] }),
      onPolicyChange: () => () => {},
    },
  };

  it("returns undefined when no tools have systemPrompt", async () => {
    const toolDefinitions: Record<string, ToolDefinition> = {
      tool1: {
        description: "A tool",
        parameters: {} as ToolDefinition["parameters"],
        execute: async () => ({ ok: true, output: "done" }),
      },
    };

    const result = await buildToolSystemPrompt({
      toolDefinitions,
      toolContext: mockToolContext,
    });

    expect(result).toBeUndefined();
  });

  it("collects static string systemPrompt from tools", async () => {
    const toolDefinitions: Record<string, ToolDefinition> = {
      tool1: {
        description: "A tool",
        parameters: {} as ToolDefinition["parameters"],
        systemPrompt: "Always use JSON format for output.",
        execute: async () => ({ ok: true, output: "done" }),
      },
      tool2: {
        description: "Another tool",
        parameters: {} as ToolDefinition["parameters"],
        systemPrompt: "Validate all inputs before processing.",
        execute: async () => ({ ok: true, output: "done" }),
      },
    };

    const result = await buildToolSystemPrompt({
      toolDefinitions,
      toolContext: mockToolContext,
    });

    expect(result).toContain("## tool1");
    expect(result).toContain("Always use JSON format for output.");
    expect(result).toContain("## tool2");
    expect(result).toContain("Validate all inputs before processing.");
  });

  it("handles function-based systemPrompt (sync)", async () => {
    const toolDefinitions: Record<string, ToolDefinition> = {
      tool1: {
        description: "A tool",
        parameters: {} as ToolDefinition["parameters"],
        systemPrompt: (ctx: ToolContext) => `Agent: ${ctx.agentName}`,
        execute: async () => ({ ok: true, output: "done" }),
      },
    };

    const result = await buildToolSystemPrompt({
      toolDefinitions,
      toolContext: mockToolContext,
    });

    expect(result).toContain("## tool1");
    expect(result).toContain("Agent: test-agent");
  });

  it("handles function-based systemPrompt (async)", async () => {
    const toolDefinitions: Record<string, ToolDefinition> = {
      tool1: {
        description: "A tool",
        parameters: {} as ToolDefinition["parameters"],
        systemPrompt: async (ctx: ToolContext) => `CWD: ${ctx.guard.cwd}`,
        execute: async () => ({ ok: true, output: "done" }),
      },
    };

    const result = await buildToolSystemPrompt({
      toolDefinitions,
      toolContext: mockToolContext,
    });

    expect(result).toContain("## tool1");
    expect(result).toContain("CWD: /test");
  });

  it("skips tools with empty systemPrompt", async () => {
    const toolDefinitions: Record<string, ToolDefinition> = {
      tool1: {
        description: "A tool",
        parameters: {} as ToolDefinition["parameters"],
        systemPrompt: "",
        execute: async () => ({ ok: true, output: "done" }),
      },
    };

    const result = await buildToolSystemPrompt({
      toolDefinitions,
      toolContext: mockToolContext,
    });

    expect(result).toBeUndefined();
  });
});

describe("mergeSystemPrompts", () => {
  it("merges multiple prompts with double newline", () => {
    const result = mergeSystemPrompts(["Base prompt", "Tool prompt"]);

    expect(result).toBe("Base prompt\n\nTool prompt");
  });

  it("filters out undefined prompts", () => {
    const result = mergeSystemPrompts([
      "Base prompt",
      undefined,
      "Tool prompt",
    ]);

    expect(result).toBe("Base prompt\n\nTool prompt");
  });

  it("returns undefined when all prompts are undefined or empty", () => {
    const result = mergeSystemPrompts([undefined, ""]);

    expect(result).toBeUndefined();
  });

  it("handles single prompt", () => {
    const result = mergeSystemPrompts(["Single prompt"]);
    expect(result).toBe("Single prompt");
  });
});
