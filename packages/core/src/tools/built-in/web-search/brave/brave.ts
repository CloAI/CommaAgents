import { z } from "zod";

import type { WebSearchProvider } from "../web-search.types";

const BraveResponseSchema = z.object({
  web: z
    .object({
      results: z.array(
        z.object({
          title: z.string(),
          url: z.string(),
          description: z.string().optional(),
          page_age: z.string().optional(),
          age: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

/**
 * Brave Search API backend, configured by the `brave-search` credential (env `BRAVE_SEARCH_API_KEY`).
 *
 * @returns {WebSearchProvider} The Brave provider.
 * @example
 * ```ts
 * createWebSearchTool({ providers: [createBraveSearchProvider()] });
 * ```
 */
export function createBraveSearchProvider(): WebSearchProvider {
  return {
    name: "brave",
    credentialId: "brave-search",
    async search({ query, count, signal, credential }) {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(count));
      const response = await fetch(url, {
        signal,
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": credential,
        },
      });
      if (!response.ok) {
        throw new Error(
          `Brave Search returned HTTP ${response.status} ${response.statusText}`,
        );
      }
      const body = BraveResponseSchema.parse(await response.json());
      return (body.web?.results ?? []).map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.description ?? "",
        ...((result.page_age ?? result.age)
          ? { published: result.page_age ?? result.age }
          : {}),
      }));
    },
  };
}
