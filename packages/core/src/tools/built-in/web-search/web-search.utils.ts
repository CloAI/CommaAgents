import type { WebSearchResult } from "./web-search.types";

/**
 * Render results as a numbered list the model can cite by URL.
 * @param {string} provider - Backend that answered.
 * @param {string} query - Query that was run.
 * @param {readonly WebSearchResult[]} results - Ranked results.
 * @returns {string} Tool output text.
 */
export function formatResults(
  provider: string,
  query: string,
  results: readonly WebSearchResult[],
): string {
  if (results.length === 0)
    return `No results from ${provider} for "${query}".`;
  const lines = results.map((result, resultIndex) =>
    [
      `${resultIndex + 1}. ${result.title}`,
      `   ${result.url}${result.published ? ` (${result.published})` : ""}`,
      ...(result.snippet ? [`   ${result.snippet}`] : []),
    ].join("\n"),
  );
  return [`Results from ${provider} for "${query}":`, ...lines].join("\n");
}
