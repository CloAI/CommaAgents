import TurndownService from "turndown";

/**
 * Combine multiple AbortSignals into one. Aborts as soon as any input aborts.
 */
export function mergeAbortSignals(
  signals: readonly AbortSignal[],
): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

let turndownService: TurndownService | undefined;

/**
 * Lazily-instantiated Turndown service. Strips script/style noise and
 * uses sensible defaults for LLM-friendly markdown output.
 */
export function getTurndown(): TurndownService {
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
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Convert HTML into the requested output format.
 */
export function transformContent(
  html: string,
  format: "text" | "markdown" | "html",
): string {
  if (format === "html") return html;
  const markdown = getTurndown().turndown(html);
  return format === "text" ? stripMarkdown(markdown) : markdown;
}
