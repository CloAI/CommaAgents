// Integration test: Tool System Prompt Injection
//
// Verifies that tools with `systemPrompt` field have their contributions
// injected ONCE into the agent's system prompt at creation time.

import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  buildToolSystemPrompt,
  mergeSystemPrompts,
} from "./build-tool-system-prompt";
import { defineTool } from "./define/define-tool";
import type { ToolContext, ToolDefinition } from "./tool.types";

describe("Tool System Prompt Injection - Integration", () => {
  const mockToolContext: ToolContext = {
    agentName: "test-agent",
    abort: new AbortController().signal,
    guard: {
      toolName: "test",
      cwd: "/workspace",
      trashMetadata: undefined,
      authorize: async () => "/workspace/test",
      canAccess: () => true,
      addPolicy: () => {},
      removePolicy: () => false,
      getPolicies: () => ({ toolName: "test", policies: [] }),
      onPolicyChange: () => () => {},
    },
  };

  it("should inject static systemPrompt from tools into agent", async () => {
    // Define tools with systemPrompt
    const toolDefs: Record<string, ToolDefinition> = {
      read_file: defineTool({
        description: "Read a file",
        parameters: z.object({ path: z.string() }),
        systemPrompt: "Always validate file paths before reading.",
        execute: async (_args, _ctx) => ({ ok: true, output: "content" }),
      }),
      write_file: defineTool({
        description: "Write a file",
        parameters: z.object({ path: z.string(), content: z.string() }),
        systemPrompt: "Create parent directories if they don't exist.",
        execute: async (_args, _ctx) => ({ ok: true, output: "written" }),
      }),
    };

    // Build tool system prompt
    const toolPrompt = await buildToolSystemPrompt({
      toolDefinitions: toolDefs,
      toolContext: mockToolContext,
    });

    expect(toolPrompt).toContain("## read_file");
    expect(toolPrompt).toContain("Always validate file paths before reading.");
    expect(toolPrompt).toContain("## write_file");
    expect(toolPrompt).toContain(
      "Create parent directories if they don't exist.",
    );
  });

  it("should inject dynamic systemPrompt (function) from tools", async () => {
    const toolDefs: Record<string, ToolDefinition> = {
      search_files: defineTool({
        description: "Search files",
        parameters: z.object({ pattern: z.string() }),
        systemPrompt: (ctx: ToolContext) => {
          return `Searching in: ${ctx.guard.cwd}. Use glob patterns.`;
        },
        execute: async (_args, _ctx) => ({ ok: true, output: "results" }),
      }),
    };

    const toolPrompt = await buildToolSystemPrompt({
      toolDefinitions: toolDefs,
      toolContext: mockToolContext,
    });

    expect(toolPrompt).toContain("## search_files");
    expect(toolPrompt).toContain(
      "Searching in: /workspace. Use glob patterns.",
    );
  });

  it("should merge multiple prompts correctly", () => {
    const merged = mergeSystemPrompts([
      "Base system prompt",
      "## read_file\nAlways validate file paths.",
      undefined,
      "## write_file\nCreate parent directories.",
    ]);

    expect(merged).toBe(
      "Base system prompt\n\n## read_file\nAlways validate file paths.\n\n## write_file\nCreate parent directories.",
    );
  });
});
