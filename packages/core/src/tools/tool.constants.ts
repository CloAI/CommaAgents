// Tool constants — built-in tool names and factory map.

import { createBashTool } from "./built-in/bash/bash";
import { createEditTool } from "./built-in/edit/edit";
import { createGlobTool } from "./built-in/glob/glob";
import { createGrepTool } from "./built-in/grep/grep";
import { createLsTool } from "./built-in/ls/ls";
import { createReadTool } from "./built-in/read/read";
import {
  createTodoAddTool,
  createTodoClearTool,
  createTodoCompleteTool,
  createTodoGetNextTool,
  createTodoGetTool,
} from "./built-in/todo/todo";
import { createWebFetchTool } from "./built-in/webfetch/webfetch";
import { createWriteTool } from "./built-in/write/write";
import type { ToolDefinition } from "./tool.types";

/** The set of tool names recognized as built-in. */
export const BUILT_IN_TOOL_NAMES = [
  "bash",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "ls",
  "webfetch",
  "todo_add",
  "todo_complete",
  "todo_get",
  "todo_get_next",
  "todo_clear",
] as const;

/** Factory map for instantiating built-in tools by name. */
export const BUILT_IN_TOOL_FACTORIES: Readonly<Record<string, () => ToolDefinition>> = {
  bash: () => createBashTool(),
  read: () => createReadTool(),
  write: () => createWriteTool(),
  edit: () => createEditTool(),
  glob: () => createGlobTool(),
  grep: () => createGrepTool(),
  ls: () => createLsTool(),
  webfetch: () => createWebFetchTool(),
  todo_add: () => createTodoAddTool(),
  todo_complete: () => createTodoCompleteTool(),
  todo_get: () => createTodoGetTool(),
  todo_get_next: () => createTodoGetNextTool(),
  todo_clear: () => createTodoClearTool(),
};
