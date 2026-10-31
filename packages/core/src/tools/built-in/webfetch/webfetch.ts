import { z } from "zod";

import { defineTool } from "../../define/define-tool";
import { okResult } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import {
  DEFAULT_MAX_CONTENT_LENGTH,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_USER_AGENT,
} from "./webfetch.constants";
import type { WebFetchToolConfig } from "./webfetch.types";
import { mergeAbortSignals, transformContent } from "./webfetch.utils";

const webFetchParams = z.object({
  url: z.string().url().describe("The fully-qualified URL to fetch."),
  format: z
    .enum(["text", "markdown", "html"])
    .optional()
    .default("markdown")
    .describe(
      'Output format: "markdown" (HTML converted to Markdown), "text" (plain text only), ' +
        'or "html" (raw HTML). Defaults to "markdown".',
    ),
  timeout: z
    .number()
    .positive()
    .optional()
    .describe("Optional request timeout in seconds. Defaults to 30."),
  offset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Character offset into the converted content. Use the value from a truncation notice to read the next part. Defaults to 0.",
    ),
});

/**
 * Create a webfetch tool for retrieving and converting web content.
 *
 * @param config - Optional configuration overriding default timeout, content length, and user-agent.
 * @example
 * ```ts
 * const webfetch = createWebFetchTool();
 *
 * // With custom defaults
 * const webfetch = createWebFetchTool({
 *   defaultTimeout: 60,
 *   maxContentLength: 100_000,
 * });
 * ```
 */
export function createWebFetchTool(
  config?: WebFetchToolConfig,
): ToolDefinition<typeof webFetchParams> {
  const defaultTimeout = config?.defaultTimeout ?? DEFAULT_TIMEOUT_SECONDS;
  const maxContentLength =
    config?.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;
  const userAgent = config?.userAgent ?? DEFAULT_USER_AGENT;

  return defineTool({
    description: describeTool({
      purpose:
        "Fetch content from a URL and return it converted to the requested format. Use this to retrieve and analyze web content.",
      inputs: [
        {
          name: "url",
          type: "string",
          required: true,
          description: "The fully-qualified URL to fetch.",
        },
        {
          name: "format",
          type: '"text" | "markdown" | "html"',
          required: false,
          defaultValue: '"markdown"',
          description:
            'Output format: "markdown" (HTML converted to Markdown), "text" (plain text only), or "html" (raw HTML).',
        },
        {
          name: "timeout",
          type: "number",
          required: false,
          defaultValue: `${defaultTimeout}`,
          description: "Request timeout in seconds.",
        },
        {
          name: "offset",
          type: "number",
          required: false,
          defaultValue: "0",
          description:
            "Character offset into the converted content, for reading long pages in parts.",
        },
      ],
      outputs:
        "The converted content as a string. `metadata` includes `{ url, finalUrl, statusCode, contentType, format, durationMs, truncated, originalLength }`.",
      errors: [],
      notes: [
        "The default 'markdown' format converts HTML to Markdown for readable, LLM-friendly output.",
        "Use 'text' for plain text (useful for content extraction) or 'html' for the raw response.",
        `At most ${maxContentLength} characters are returned per call; a truncation notice gives the offset of the next part.`,
        "Markdown output drops navigation, headers, footers, and forms so the page's main content comes first.",
      ],
    }),
    parameters: webFetchParams,
    execute: async (validatedArguments, toolContext) => {
      const format = validatedArguments.format ?? "markdown";
      const timeoutSeconds = validatedArguments.timeout ?? defaultTimeout;
      const startTime = Date.now();

      const timeoutSignal = AbortSignal.timeout(timeoutSeconds * 1_000);
      const signal = mergeAbortSignals([toolContext.abort, timeoutSignal]);

      const response = await fetch(validatedArguments.url, {
        signal,
        headers: { "User-Agent": userAgent },
        redirect: "follow",
      });

      const contentType = response.headers.get("content-type") ?? "";
      const rawBody = await response.text();
      const transformed = transformContent(rawBody, format);
      const offset = Math.min(
        validatedArguments.offset ?? 0,
        transformed.length,
      );
      const end = Math.min(offset + maxContentLength, transformed.length);
      const truncated = end < transformed.length;
      const output = transformed.slice(offset, end);

      const durationMs = Date.now() - startTime;

      const header = response.ok
        ? ""
        : `[HTTP ${response.status} ${response.statusText}]\n\n`;
      const footer = truncated
        ? `\n\n[Content truncated: showing characters ${offset}–${end} of ${transformed.length}. Call webfetch again with offset=${end} for more.]`
        : "";

      return okResult(`${header}${output}${footer}`, {
        metadata: {
          url: validatedArguments.url,
          finalUrl: response.url,
          statusCode: response.status,
          contentType,
          format,
          durationMs,
          truncated,
          offset,
          nextOffset: truncated ? end : undefined,
          originalLength: transformed.length,
        },
      });
    },
  });
}
