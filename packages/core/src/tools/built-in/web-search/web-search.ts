import { z } from "zod";

import { getGlobalCredentialStore } from "../../../credentials/global-credential-store";
import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import { mergeAbortSignals } from "../webfetch/webfetch.utils";
import { createBraveSearchProvider } from "./brave";
import { createSearxngSearchProvider } from "./searxng";
import {
  DEFAULT_RESULT_COUNT,
  MAX_RESULT_COUNT,
  SEARCH_TIMEOUT_MS,
} from "./web-search.constants";
import type { WebSearchData, WebSearchToolConfig } from "./web-search.types";
import { formatResults } from "./web-search.utils";

export const webSearchParams = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Search query. Specific queries with distinctive terms work best.",
    ),
  count: z
    .number()
    .int()
    .min(1)
    .max(MAX_RESULT_COUNT)
    .optional()
    .describe(
      `Number of results, 1–${MAX_RESULT_COUNT}. Defaults to ${DEFAULT_RESULT_COUNT}.`,
    ),
});

/**
 * Create the `web_search` tool, which queries the first configured search backend.
 *
 * Backends are configured through the credential store: `brave-search` (env `BRAVE_SEARCH_API_KEY`)
 * and `searxng` (env `SEARXNG_URL`, the instance URL).
 *
 * @param {WebSearchToolConfig} [config] - Backends to try, in order.
 * @returns {ToolDefinition<typeof webSearchParams, WebSearchData>} The tool definition.
 * @example
 * ```ts
 * const webSearch = createWebSearchTool();
 * ```
 */
export function createWebSearchTool(
  config?: WebSearchToolConfig,
): ToolDefinition<typeof webSearchParams, WebSearchData> {
  const providers = config?.providers ?? [
    createBraveSearchProvider(),
    createSearxngSearchProvider(),
  ];
  return defineTool<typeof webSearchParams, WebSearchData>({
    description: describeTool({
      purpose: [
        "Search the web and return ranked results with titles, URLs, dates when known, and snippets.",
        "Snippets are previews, not sources: fetch a page with webfetch before relying on what it says.",
      ],
      inputs: [
        {
          name: "query",
          type: "string",
          required: true,
          description: "Search query.",
        },
        {
          name: "count",
          type: "number",
          required: false,
          defaultValue: String(DEFAULT_RESULT_COUNT),
          description: `Number of results (max ${MAX_RESULT_COUNT}).`,
        },
      ],
      outputs:
        "`{ provider, query, results: [{ title, url, snippet, published? }] }`.",
      errors: [
        {
          kind: "unknown",
          description:
            "No search backend is configured, or the backend failed. Without search, answer from what you can fetch directly or say search is unavailable.",
        },
        {
          kind: "timeout",
          description:
            "The backend did not answer in time. Retry once with a shorter query.",
        },
      ],
      notes: [
        "Rephrase and search again when results are off-topic; vary terms rather than repeating the same query.",
      ],
    }),
    parameters: webSearchParams,
    async execute({ query, count }, toolContext) {
      const store = getGlobalCredentialStore();
      for (const provider of providers) {
        const credential = await store.resolve(provider.credentialId);
        if (credential?.type !== "api") continue;
        try {
          const results = await provider.search({
            query,
            count: count ?? DEFAULT_RESULT_COUNT,
            signal: mergeAbortSignals([
              toolContext.abort,
              AbortSignal.timeout(SEARCH_TIMEOUT_MS),
            ]),
            credential: credential.key,
          });
          return okResult<WebSearchData>(
            formatResults(provider.name, query, results),
            {
              data: { provider: provider.name, query, results },
            },
          );
        } catch (searchError) {
          const timedOut =
            searchError instanceof DOMException &&
            searchError.name === "TimeoutError";
          return errorResult<WebSearchData>(
            toolError(
              timedOut ? "timeout" : "unknown",
              `${provider.name} search failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`,
              {
                recoverable: true,
                suggestedNextAction:
                  "Retry once, or continue with webfetch on known URLs.",
              },
            ),
          );
        }
      }
      return errorResult<WebSearchData>(
        toolError(
          "unknown",
          `No web search backend is configured. Set one of: ${providers.map((provider) => provider.credentialId).join(", ")}.`,
          { recoverable: false },
        ),
      );
    },
  });
}
