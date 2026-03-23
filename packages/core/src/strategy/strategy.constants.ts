// Strategy constants — named constants and default value objects.
// Internal only — not exported from the barrel.

import {
  createBashTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createReadTool,
  createWriteTool,
} from "../tools/built-in/index";
import type { ToolDef } from "../tools/tool.types";

/** The set of tool names recognized as built-in. */
export const BUILT_IN_TOOL_NAMES = ["bash", "read", "write", "edit", "glob", "grep"] as const;

/** Factory map for instantiating built-in tools by name. */
export const BUILT_IN_TOOL_FACTORIES: Readonly<Record<string, () => ToolDef>> = {
  bash: () => createBashTool(),
  read: () => createReadTool(),
  write: () => createWriteTool(),
  edit: () => createEditTool(),
  glob: () => createGlobTool(),
  grep: () => createGrepTool(),
};
