import { open } from "node:fs/promises";
import { z } from "zod";

import { SandboxViolationError } from "../../../errors";
import { defineTool } from "../../define/define-tool";
import {
  isLikelyBinary,
  sandboxErrorToToolError,
  sha256OfBuffer,
} from "../../io";
import { stripBom } from "../../io/bom";
import { toLF } from "../../io/newline";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import {
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_OUTPUT_BYTES,
} from "./read-file.constants";
import type { ReadFileData, ReadFileToolConfig } from "./read-file.types";
import { describeTool } from "../describe-tool";
import { fitReadOutput, formatReadOutput } from "./read-file.utils";

export const readFileParams = z
  .object({
    path: z.string().min(1).describe("Workspace-relative text file path."),
    startLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-indexed inclusive start line. Defaults to 1."),
    endLine: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "1-indexed inclusive end line. Defaults to EOF; clamped at EOF.",
      ),
  })
  .strict();

/**
 * Create a text reader with bounded file and output sizes.
 * @param {ReadFileToolConfig} [config] - File and formatted output byte limits.
 * @returns {ToolDefinition} The text-reading tool.
 * @example
 * const reader = createReadFileTool({ maxFileBytes: 4 * 1024 * 1024 });
 */
export function createReadFileTool(
  config?: ReadFileToolConfig,
): ToolDefinition<typeof readFileParams, ReadFileData> {
  const maxFileBytes = config?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxOutputBytes = config?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (
    !Number.isSafeInteger(maxFileBytes) ||
    maxFileBytes < 1 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes < 1
  ) {
    throw new Error("read_file byte limits must be positive safe integers.");
  }
  return defineTool({
    description: describeTool({
      purpose:
        "Read text as whole lines with a full raw-file SHA-256 for stale-write checks.",
      inputs: [
        {
          name: "path",
          type: "string",
          required: true,
          description: "Workspace-relative file path.",
        },
        {
          name: "startLine",
          type: "number",
          required: false,
          defaultValue: "1",
          description: "1-indexed inclusive first line.",
        },
        {
          name: "endLine",
          type: "number",
          required: false,
          defaultValue: "EOF",
          description:
            "Inclusive last line, at least startLine; clamped at EOF.",
        },
      ],
      outputs:
        "{ content, startLine, endLine, lineCount, sizeBytes, sha256, truncated }. Text is LF-normalized without BOM; sha256 covers original bytes. endLine is the actual last returned line. Continue truncated reads at endLine + 1.",
      errors: [
        {
          kind: "file_too_large",
          description: `Raw files over ${maxFileBytes} bytes are refused. Whole-line output including summary is capped at ${maxOutputBytes} bytes; a first line that cannot fit is refused. Inspect a bounded portion with a command.`,
        },
        {
          kind: "binary_file",
          description:
            "Text only; use a format-aware tool or command for binary files.",
        },
        {
          kind: "not_found",
          description:
            "Missing file or directory path. List directories using glob with pattern *.",
        },
        {
          kind: "outside_workspace",
          description: "Path is outside the permitted workspace.",
        },
        {
          kind: "permission_denied",
          description: "Path is blocked or unreadable.",
        },
      ],
    }),
    systemPrompt:
      "Read files before editing. Use startLine/endLine for focused reads. Preserve sha256 for write_file and stale-file checks. If truncated, continue at endLine + 1. Find paths with glob and search contents with grep.",
    parameters: readFileParams,
    execute: async (args, { guard, abort, agentName }) => {
      abort?.throwIfAborted();
      if (args.endLine !== undefined && args.endLine < (args.startLine ?? 1)) {
        return errorResult(
          toolError(
            "unknown",
            "endLine must be greater than or equal to startLine.",
            { recoverable: true },
          ),
        );
      }
      try {
        const path = await guard.authorize(
          { type: "fs.read", resource: args.path },
          { agentName, toolName: "read_file", signal: abort },
        );
        abort?.throwIfAborted();
        const file = await open(path, "r");
        let buffer: Buffer;
        try {
          const details = await file.stat();
          abort?.throwIfAborted();
          if (details.isDirectory()) {
            return errorResult(
              toolError("not_found", `Path is a directory: ${args.path}.`, {
                recoverable: true,
                suggestedNextAction: `Use glob with root="${args.path}" and pattern="*".`,
              }),
            );
          }
          if (!details.isFile()) {
            return errorResult(
              toolError(
                "binary_file",
                "read_file only reads regular text files.",
                { recoverable: false },
              ),
            );
          }
          if (details.size > maxFileBytes) {
            return oversizedFile(args.path, maxFileBytes);
          }
          const chunks: Buffer[] = [];
          let length = 0;
          while (length <= maxFileBytes) {
            abort?.throwIfAborted();
            const chunk = Buffer.alloc(
              Math.min(64 * 1024, maxFileBytes + 1 - length),
            );
            const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
            abort?.throwIfAborted();
            if (bytesRead === 0) {
              break;
            }
            chunks.push(chunk.subarray(0, bytesRead));
            length += bytesRead;
          }
          if (length > maxFileBytes) {
            return oversizedFile(args.path, maxFileBytes);
          }
          buffer = Buffer.concat(chunks, length);
        } finally {
          await file.close();
        }
        abort?.throwIfAborted();
        if (isLikelyBinary(buffer)) {
          return errorResult(
            toolError(
              "binary_file",
              `File is binary: ${args.path}. read_file supports text only.`,
              {
                recoverable: false,
                suggestedNextAction:
                  "Use a tool or command that understands this file format.",
              },
            ),
          );
        }
        const lines = toLF(
          stripBom(
            new TextDecoder("utf-8", { ignoreBOM: true }).decode(buffer),
          ),
        ).split("\n");
        const startLine = args.startLine ?? 1;
        const selected = lines.slice(
          startLine - 1,
          Math.min(args.endLine ?? lines.length, lines.length),
        );
        const data = fitReadOutput(
          args.path,
          selected,
          {
            startLine,
            lineCount: lines.length,
            sizeBytes: buffer.byteLength,
            sha256: sha256OfBuffer(buffer),
          },
          maxOutputBytes,
        );
        if (!data) {
          return errorResult(
            toolError(
              "file_too_large",
              "The first requested line and summary exceed the read_file output limit.",
              {
                recoverable: true,
                suggestedNextAction:
                  "Use grep to locate shorter lines, or use a command to inspect a portion of the long line.",
              },
            ),
          );
        }
        abort?.throwIfAborted();
        return okResult(formatReadOutput(args.path, data), { data });
      } catch (caught) {
        abort?.throwIfAborted();
        if (caught instanceof SandboxViolationError) {
          return errorResult(sandboxErrorToToolError(caught));
        }
        const code = (caught as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") {
          return errorResult(
            toolError("not_found", `File does not exist: ${args.path}`, {
              path: args.path,
              recoverable: false,
            }),
          );
        }
        if (code === "EACCES" || code === "EPERM") {
          return errorResult(
            toolError("permission_denied", `Cannot read file: ${args.path}`, {
              path: args.path,
              recoverable: false,
            }),
          );
        }
        throw caught;
      }
    },
  });
}

/**
 * Explain the raw-file limit without suggesting a slice that still exceeds it.
 * @param {string} path - Requested file path.
 * @param {number} maxFileBytes - Raw file byte limit.
 * @returns {ToolResult<ReadFileData>} An actionable file-size error.
 */
function oversizedFile(path: string, maxFileBytes: number) {
  return errorResult<ReadFileData>(
    toolError(
      "file_too_large",
      `File exceeds the ${maxFileBytes}-byte read_file limit: ${path}`,
      {
        recoverable: true,
        suggestedNextAction:
          "Use a command that reads a bounded portion of this file, or increase the application maxFileBytes setting.",
      },
    ),
  );
}
