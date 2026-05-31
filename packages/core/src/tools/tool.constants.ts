// // import { createApplyPatchTool } from "./built-in/apply-patch";
import { createAskQuestionTool } from "./built-in/ask-question";
import { createCreateFileTool } from "./built-in/create-file";
import { createDeleteFileTool } from "./built-in/delete-file";
import { createEditFileTool } from "./built-in/edit-file";
import { createGlobTool } from "./built-in/glob";
import { createLaunchStrategyTool } from "./built-in/launch-strategy";
import { createListDirectoryTool } from "./built-in/list-directory";
import { createListSkillsTool } from "./built-in/list-skills";
import { createListStrategyTool } from "./built-in/list-strategy";
import { createLoadSkillTool } from "./built-in/load-skill";
import { createLspRequestTool } from "./built-in/lsp-request";
import { createMoveFileTool } from "./built-in/move-file";
import { createReadFileTool } from "./built-in/read-file";
import { createRestoreFileTool } from "./built-in/restore-file";
import { createRunCommandTool } from "./built-in/run-command";
import { createSearchFilesTool } from "./built-in/search-files";
import {
  createTodoAddTool,
  createTodoClearTool,
  createTodoCompleteTool,
  createTodoGetNextTool,
  createTodoGetTool,
  createTodoRemoveTool,
} from "./built-in/todo/todo";
import { createWebFetchTool } from "./built-in/webfetch/webfetch";
import { createWriteFileTool } from "./built-in/write-file";
import type { ToolDefinition } from "./tool.types";

/**
 * The set of tool names recognized as built-in.
 */
export const BUILT_IN_TOOL_NAMES = [
  "read_file",
  "list_directory",
  "search_files",
  "glob",
  "create_file",
  "write_file",
  "edit_file",
  "delete_file",
  "restore_file",
  "move_file",
  // "apply_patch",
  "run_command",
  "webfetch",
  "load_skill",
  "list_skills",
  "list_strategy",
  "launch_strategy",
  "todo_add",
  "todo_complete",
  "todo_get",
  "todo_get_next",
  "todo_remove",
  "todo_clear",
  "ask_question",
  "lsp_request",
] as const;

/** Factory map for instantiating built-in tools by name. */
export const BUILT_IN_TOOL_FACTORIES: Readonly<
  Record<string, () => ToolDefinition>
> = {
  read_file: () => createReadFileTool(),
  list_directory: () => createListDirectoryTool(),
  search_files: () => createSearchFilesTool(),
  glob: () => createGlobTool(),
  create_file: () => createCreateFileTool(),
  write_file: () => createWriteFileTool(),
  edit_file: () => createEditFileTool(),
  delete_file: () => createDeleteFileTool(),
  restore_file: () => createRestoreFileTool(),
  move_file: () => createMoveFileTool(),
  // apply_patch: () => createApplyPatchTool(),
  run_command: () => createRunCommandTool(),
  webfetch: () => createWebFetchTool(),
  load_skill: () => createLoadSkillTool(),
  list_skills: () => createListSkillsTool(),
  list_strategy: () => createListStrategyTool(),
  launch_strategy: () => createLaunchStrategyTool(),
  todo_add: () => createTodoAddTool(),
  todo_complete: () => createTodoCompleteTool(),
  todo_get: () => createTodoGetTool(),
  todo_get_next: () => createTodoGetNextTool(),
  todo_remove: () => createTodoRemoveTool(),
  todo_clear: () => createTodoClearTool(),
  ask_question: () => createAskQuestionTool(),
  lsp_request: () => createLspRequestTool(),
};
