// write — write content to a file as an agent tool

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { defineTool } from "../define/define-tool";
import type { ToolDef } from "../tool";

const writeParams = z.object({
  filePath: z.string().describe("Absolute or relative path to the file to write."),
  content: z.string().describe("The content to write to the file."),
});

/**
 * Create a write tool for creating or overwriting files.
 *
 * Creates parent directories as needed. Returns confirmation with
 * the number of bytes written and lines in the content.
 *
 * @example
 * ```ts
 * const write = createWriteTool();
 * const tools = { write };
 * ```
 */
export function createWriteTool(): ToolDef<typeof writeParams> {
  return defineTool({
    description:
      "Write content to a file, creating it if it does not exist or overwriting it if it does. " +
      "Parent directories are created automatically. Use this for creating new files or " +
      "completely replacing file contents.",
    parameters: writeParams,
    execute: async (args, _ctx) => {
      const { filePath, content } = args;

      try {
        // Ensure parent directory exists
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf-8");

        const lines = content.split("\n").length;
        const bytes = Buffer.byteLength(content, "utf-8");

        return {
          output: `Successfully wrote ${bytes} bytes (${lines} lines) to ${filePath}`,
          metadata: { filePath, bytes, lines },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          output: `Error: could not write to ${filePath}: ${message}`,
          metadata: { error: true, filePath },
        };
      }
    },
  });
}
