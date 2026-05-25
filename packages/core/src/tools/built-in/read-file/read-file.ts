import { stat } from "node:fs/promises";
import { z } from "zod";
import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import {
  isLikelyBinary,
  sandboxErrorToToolError,
  sha256OfBuffer,
} from "../../io";
import { hasBom, stripBom } from "../../io/bom";
import { detectNewline, toLF } from "../../io/newline";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import { DEFAULT_MAX_BYTES } from "./read-file.constants";
import type { ReadFileData, ReadFileToolConfig } from "./read-file.types";
import { formatTextSummary, truncateUtf8 } from "./read-file.utils";

export const readFileParams = z.object({
  path: z
    .string()
    .min(1)
    .describe(
      "Workspace-relative path to the file. Absolute paths are rejected unless the sandbox " +
        "is configured with `allowAbsolutePaths: true`.",
    ),
  startLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("1-indexed inclusive line to start at. Defaults to 1."),
  endLine: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "1-indexed inclusive line to end at. Clamped to the file's lineCount when larger. " +
        "Defaults to the end of the file.",
    ),
  maxBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Maximum UTF-8 byte length of the returned content. When the slice exceeds this, " +
        "content is truncated and `data.truncated` is set to true. Defaults to 262144.",
    ),
  allowBinary: z
    .boolean()
    .optional()
    .describe(
      "Opt in to receiving the contents of a binary file as base64. Required for any file " +
        "whose first 8 KiB contains a NUL byte. Defaults to false.",
    ),
});

/**
 * Create the `read_file` tool.
 *
 * @param config - Optional configuration overriding the default max-bytes cap.
 * @example
 * ```ts
 * const readFile = createReadFileTool();
 * ```
 */
export function createReadFileTool(
  config?: ReadFileToolConfig,
): ToolDefinition<typeof readFileParams, ReadFileData> {
  const defaultMaxBytes = config?.defaultMaxBytes ?? DEFAULT_MAX_BYTES;

  return defineTool<typeof readFileParams, ReadFileData>({
    description: describeTool({
      purpose:
        "Read a workspace file and return its UTF-8 content plus a sha256 over the whole on-disk bytes for stale-file detection.",
      inputs: [
        {
          name: "path",
          type: "string",
          required: true,
          description: "Workspace-relative path to the file.",
        },
        {
          name: "startLine",
          type: "number",
          required: false,
          description:
            "1-indexed inclusive start line for slicing large files.",
        },
        {
          name: "endLine",
          type: "number",
          required: false,
          description:
            "1-indexed inclusive end line; clamped to the file's lineCount.",
        },
        {
          name: "maxBytes",
          type: "number",
          required: false,
          defaultValue: `${defaultMaxBytes}`,
          description:
            "Cap on the UTF-8 byte length of the returned slice; oversized slices set `data.truncated`.",
        },
        {
          name: "allowBinary",
          type: "boolean",
          required: false,
          defaultValue: "false",
          description:
            "Opt in to reading binary content as base64. The first call on a binary file always returns `binary_file`.",
        },
      ],
      outputs:
        "`{ content?, contentBase64?, startLine, endLine, lineCount, sizeBytes, sha256, truncated, binary, newlineStyle, hasBom, encoding }`. `sha256` always reflects the full file so it can be passed verbatim as `expectedSha256`.",
      errors: [
        {
          kind: "not_found",
          description:
            "File missing, or path resolves to a directory — use `list_directory` instead.",
        },
        {
          kind: "outside_workspace",
          description:
            "Path escapes the sandbox root or is absolute when not allowed.",
        },
        {
          kind: "permission_denied",
          description:
            "Path matches a forbidden glob or is otherwise read-blocked by the sandbox.",
        },
        {
          kind: "binary_file",
          description:
            "File is binary and `allowBinary` was not set. `data.sizeBytes` and `data.sha256` are still returned. Re-call with `allowBinary: true` to receive base64.",
        },
      ],
      notes: [
        "Slicing operates on LF-normalized content; `sha256` is computed on the raw bytes (BOM and CRLF preserved).",
      ],
    }),
    systemPrompt: `### Using read_file

\`read_file\` is the **starting point of every file modification**. Always read before you write or edit.

**The sha256 chain:**

Every \`read_file\` response includes a \`sha256\` field — a 64-char lowercase hex hash of the file's current bytes. **Save it.** You will pass it as \`expectedSha256\` to your next \`edit_file\` / \`write_file\` / \`move_file\` / \`delete_file\` call on the same file. This is how the tools detect concurrent edits and refuse stale writes.

If a subsequent edit/write returns \`stale_file\`, the file changed under you — re-call \`read_file\` to get a fresh \`sha256\` and retry.

**Required:**

- \`path\`: workspace-relative file path (e.g. \`"src/App.tsx"\`). Use \`./relative/path\` or just \`"src/foo.ts"\` — absolute paths are rejected unless the sandbox explicitly permits them.

**Useful optional arguments:**

- \`startLine\` / \`endLine\` (1-indexed, inclusive): read only a slice of a large file. The \`sha256\` is **always** the hash of the full file, never the slice — so chaining writes still works.
- \`allowBinary: true\`: return binary content as base64 instead of \`binary_file\` error. Rarely needed for source-code work.

**Never** edit, write, move, or delete a file without first reading it to obtain a fresh \`sha256\`.`,
    parameters: readFileParams,
    execute: async (validatedArguments, toolContext) => {
      const { guard, abort, agentName } = toolContext;

      let absolutePath: string;
      try {
        absolutePath = await guard.authorize(
          { type: "fs.read", resource: validatedArguments.path },
          { agentName, toolName: "read_file", signal: abort },
        );
      } catch (caught) {
        if (caught instanceof SandboxViolationError) {
          return errorResult<ReadFileData>(sandboxErrorToToolError(caught));
        }
        throw caught;
      }

      let statResult: Awaited<ReturnType<typeof stat>>;
      try {
        statResult = await stat(absolutePath);
      } catch (statError) {
        const code = (statError as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult<ReadFileData>(
            toolError(
              "not_found",
              `File does not exist: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: false,
              },
            ),
          );
        }
        if (code === "EACCES" || code === "EPERM") {
          return errorResult<ReadFileData>(
            toolError(
              "permission_denied",
              `Cannot stat file: ${validatedArguments.path}`,
              {
                path: validatedArguments.path,
                recoverable: false,
              },
            ),
          );
        }
        throw statError;
      }

      if (statResult.isDirectory()) {
        return errorResult<ReadFileData>(
          toolError(
            "not_found",
            `Path is a directory, not a file: ${validatedArguments.path}. Use list_directory instead.`,
            {
              path: validatedArguments.path,
              recoverable: true,
              suggestedNextAction: `Call list_directory with path="${validatedArguments.path}".`,
            },
          ),
        );
      }

      const file = Bun.file(absolutePath);
      const buffer = new Uint8Array(await file.arrayBuffer());
      const sizeBytes = buffer.byteLength;
      const sha256 = sha256OfBuffer(buffer);
      const binary = isLikelyBinary(buffer);

      if (binary) {
        if (!validatedArguments.allowBinary) {
          return errorResult<ReadFileData>(
            toolError(
              "binary_file",
              `File is binary: ${validatedArguments.path}. Pass allowBinary:true to receive base64 content.`,
              {
                path: validatedArguments.path,
                recoverable: true,
                suggestedNextAction:
                  "This file is binary. Decide whether you actually need its raw bytes; if so, " +
                  "call read_file again with allowBinary: true. Most edits should use a " +
                  "text-aware tool instead.",
              },
            ),
            {
              data: {
                encoding: "base64",
                binary: true,
                sizeBytes,
                sha256,
                startLine: 0,
                endLine: 0,
                lineCount: 0,
                truncated: false,
              },
            },
          );
        }

        const contentBase64 = Buffer.from(buffer).toString("base64");
        const data: ReadFileData = {
          contentBase64,
          encoding: "base64",
          binary: true,
          sizeBytes,
          sha256,
          startLine: 0,
          endLine: 0,
          lineCount: 0,
          truncated: false,
        };
        return okResult<ReadFileData>(
          `Read ${validatedArguments.path} — binary, ${sizeBytes} bytes, sha256=${sha256}`,
          { data },
        );
      }

      const rawText = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        buffer,
      );
      const fileHadBom = hasBom(rawText);
      const textNoBom = stripBom(rawText);
      const newlineStyle = detectNewline(textNoBom);
      const normalised = toLF(textNoBom);

      const allLines = normalised.split("\n");
      const lineCount = allLines.length;

      const requestedStart = validatedArguments.startLine ?? 1;
      const requestedEnd = validatedArguments.endLine ?? lineCount;
      const startLine = Math.min(
        Math.max(1, requestedStart),
        Math.max(lineCount, 1),
      );
      const endLine = Math.min(
        Math.max(startLine, requestedEnd),
        Math.max(lineCount, 1),
      );

      const sliceLines =
        requestedStart > lineCount
          ? []
          : allLines.slice(startLine - 1, endLine);
      const sliceText = sliceLines.join("\n");

      const cap = validatedArguments.maxBytes ?? defaultMaxBytes;
      const { content, truncated } = truncateUtf8(sliceText, cap);

      const data: ReadFileData = {
        content,
        encoding: "utf8",
        startLine: requestedStart > lineCount ? requestedStart : startLine,
        endLine: requestedStart > lineCount ? requestedStart : endLine,
        lineCount,
        sizeBytes,
        sha256,
        truncated,
        binary: false,
        newlineStyle,
        hasBom: fileHadBom,
      };

      return okResult<ReadFileData>(
        formatTextSummary(validatedArguments.path, {
          startLine: data.startLine,
          endLine: data.endLine,
          lineCount,
          sizeBytes,
          sha256,
          truncated,
        }) + (content.length > 0 ? `\n\n${content}` : ""),
        { data },
      );
    },
  });
}
