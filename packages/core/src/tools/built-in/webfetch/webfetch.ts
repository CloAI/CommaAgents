// webfetch — fetch content from URLs and return it as markdown, plain text, or HTML

import TurndownService from "turndown";
import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import type { ToolDefinition } from "../../tool.types";

/**
 * Configuration for the webfetch tool.
 */
export interface WebFetchToolConfig {
  /** Default per-request timeout in seconds (default: 30). */
  readonly defaultTimeout?: number;
  /** Maximum length of the returned content in characters (default: 50_000). */
  readonly maxContentLength?: number;
  /** Custom user-agent header (default: "CommaAgents-WebFetch/1.0"). */
  readonly userAgent?: string;
}

const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_MAX_CONTENT_LENGTH = 50_000;
const DEFAULT_USER_AGENT = "CommaAgents-WebFetch/1.0";

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
});

/**
 * Combine multiple AbortSignals into one. Aborts as soon as any input aborts.
 */
function mergeAbortSignals(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Lazily-instantiated Turndown service. Strips script/style noise and
 * uses sensible defaults for LLM-friendly markdown output.
 */
let turndownService: TurndownService | undefined;
function getTurndown(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    turndownService.remove(["script", "style", "noscript", "iframe"]);
  }
  return turndownService;
}

/**
 * Strip common Markdown syntax from text, leaving readable plain text.
 * Used for the "text" output format.
 */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/^\s*[-*+]\s+/gm, "") // bullet markers
    .replace(/^\s*>\s?/gm, "") // blockquotes
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Convert HTML into the requested output format.
 */
function transformContent(html: string, format: "text" | "markdown" | "html"): string {
  if (format === "html") return html;
  const markdown = getTurndown().turndown(html);
  return format === "text" ? stripMarkdown(markdown) : markdown;
}

/**
 * Create a webfetch tool for retrieving and converting web content.
 *
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
  const maxContentLength = config?.maxContentLength ?? DEFAULT_MAX_CONTENT_LENGTH;
  const userAgent = config?.userAgent ?? DEFAULT_USER_AGENT;

  return defineTool({
    description:
      "Fetch content from a URL and return it converted to the requested format. " +
      "Use this to retrieve and analyze web content. The default 'markdown' format " +
      "converts HTML to Markdown for readable, LLM-friendly output. Use 'text' for " +
      "plain text (useful for content extraction) or 'html' for the raw response.",
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
      const truncated = transformed.length > maxContentLength;
      const output = truncated ? transformed.slice(0, maxContentLength) : transformed;

      const durationMs = Date.now() - startTime;

      const header = response.ok
        ? ""
        : `[HTTP ${response.status} ${response.statusText}]\n\n`;
      const footer = truncated
        ? `\n\n[Content truncated to ${maxContentLength} characters]`
        : "";

      return {
        output: `${header}${output}${footer}`,
        metadata: {
          url: validatedArguments.url,
          finalUrl: response.url,
          statusCode: response.status,
          contentType,
          format,
          durationMs,
          truncated,
          originalLength: transformed.length,
        },
      };
    },
  });
}
