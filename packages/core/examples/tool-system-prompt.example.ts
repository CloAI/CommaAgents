// Example: Tool with systemPrompt contribution
//
// This example demonstrates how to use the new `systemPrompt` field
// in `defineTool()` to inject tool-specific context into the agent's
// system prompt.

import { z } from "zod";
import { defineTool } from "../define/define-tool";
import type { ToolContext } from "../tool.types";

// Example 1: Static string systemPrompt
const _readFileWithPrompt = defineTool({
  description: "Read a file from the filesystem",
  parameters: z.object({
    path: z.string(),
  }),
  // This will be injected ONCE into the agent's system prompt
  systemPrompt:
    "When reading files, always check if the path is relative to the workspace root.",
  execute: async (_args, _ctx) => {
    // ... implementation
    return { ok: true, output: "file content" };
  },
});

// Example 2: Dynamic function systemPrompt (sync)
const _writeFileWithPrompt = defineTool({
  description: "Write content to a file",
  parameters: z.object({
    path: z.string(),
    content: z.string(),
  }),
  // Dynamic prompt based on tool context
  systemPrompt: (ctx: ToolContext) => {
    return `Files will be written in: ${ctx.guard.cwd}. Always use absolute paths or paths relative to this directory.`;
  },
  execute: async (_args, _ctx) => {
    // ... implementation
    return { ok: true, output: "file written" };
  },
});

// Example 3: Dynamic function systemPrompt (async)
const _searchToolWithPrompt = defineTool({
  description: "Search for files matching a pattern",
  parameters: z.object({
    pattern: z.string(),
  }),
  // Async dynamic prompt (can do async work if needed)
  systemPrompt: async (ctx: ToolContext) => {
    return `Search is performed in: ${ctx.guard.cwd}. Use glob patterns like "**/*.ts" for broad searches.`;
  },
  execute: async (_args, _ctx) => {
    // ... implementation
    return { ok: true, output: "search results" };
  },
});

// When an agent is created with these tools, their systemPrompt contributions
// are collected and merged into the agent's system prompt ONCE at creation time.
//
// The merged prompt will look like:
// ```
// ## read_file
// When reading files, always check if the path is relative to the workspace root.
//
// ## write_file
// Files will be written in: /workspace. Always use absolute paths or paths relative to this directory.
//
// ## search_files
// Search is performed in: /workspace. Use glob patterns like "**/*.ts" for broad searches.
// ```
