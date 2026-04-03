// edit — search-and-replace file editing as an agent tool

import { readFile, writeFile } from "node:fs/promises";
import { countOccurrences } from "@comma-agents/utils";
import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import type { ToolDefinition } from "../../tool.types";

const editParams = z.object({
  filePath: z.string().describe("Absolute or relative path to the file to edit."),
  oldString: z.string().describe("The exact text to find and replace."),
  newString: z.string().describe("The text to replace it with (must differ from oldString)."),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      "If true, replace all occurrences. If false (default), fail when multiple matches are found.",
    ),
});

/**
 * Create an edit tool for search-and-replace file editing.
 *
 * Finds an exact match of `oldString` in the file and replaces it with `newString`.
 * By default, fails if the string is not found or if multiple matches exist (ambiguous).
 * Use `replaceAll: true` to replace every occurrence.
 *
 * @example
 * ```ts
 * const edit = createEditTool();
 * const tools = { edit };
 * ```
 */
export function createEditTool(): ToolDefinition<typeof editParams> {
  return defineTool({
    description:
      "Edit a file by replacing an exact string match. Provide the exact text to find " +
      "(oldString) and the replacement text (newString). The edit fails if oldString is not " +
      "found, or if multiple matches exist without replaceAll being set to true. " +
      "Prefer using this over the write tool for modifying existing files.",
    parameters: editParams,
    execute: async (validatedArguments, _toolContext) => {
      const { filePath, oldString, newString, replaceAll } = validatedArguments;

      if (oldString === newString) {
        return {
          output: "Error: oldString and newString are identical. No changes needed.",
          metadata: { error: true, filePath },
        };
      }

      let content: string;
      try {
        content = await readFile(filePath, "utf-8");
      } catch {
        return {
          output: `Error: could not read file: ${filePath}`,
          metadata: { error: true, filePath },
        };
      }

      const matchCount = countOccurrences(content, oldString);

      if (matchCount === 0) {
        return {
          output: `Error: oldString not found in ${filePath}. Verify the exact text including whitespace and indentation.`,
          metadata: { error: true, filePath, matchCount: 0 },
        };
      }

      if (matchCount > 1 && !replaceAll) {
        return {
          output:
            `Error: found ${matchCount} matches for oldString in ${filePath}. ` +
            "Provide more surrounding context to make it unique, or set replaceAll to true.",
          metadata: { error: true, filePath, matchCount },
        };
      }

      let updated: string;
      if (replaceAll) {
        updated = content.split(oldString).join(newString);
      } else {
        // Replace only the first (and only) occurrence
        const matchIndex = content.indexOf(oldString);
        updated =
          content.slice(0, matchIndex) + newString + content.slice(matchIndex + oldString.length);
      }

      try {
        await writeFile(filePath, updated, "utf-8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          output: `Error: could not write to ${filePath}: ${message}`,
          metadata: { error: true, filePath },
        };
      }

      const replacements = replaceAll ? matchCount : 1;
      return {
        output: `Successfully replaced ${replacements} occurrence${replacements > 1 ? "s" : ""} in ${filePath}`,
        metadata: { filePath, replacements },
      };
    },
  });
}
