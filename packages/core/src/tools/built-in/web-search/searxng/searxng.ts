import { z } from "zod";

import type { WebSearchProvider } from "../web-search.types";

const SearxngResponseSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      content: z.string().optional(),
      publishedDate: z.string().nullable().optional(),
    }),
  ),
});

/**
 * SearXNG backend for a self-hosted instance, configured by the `searxng` credential holding the
 * instance URL (env `SEARXNG_URL`). The instance must allow the `json` output format.
 *
 * @returns {WebSearchProvider} The SearXNG provider.
 * @example
 * ```ts
 * createWebSearchTool({ providers: [createSearxngSearchProvider()] });
 * ```
 */
export function createSearxngSearchProvider(): WebSearchProvider {
  return {
    name: "searxng",
    credentialId: "searxng",
    async search({ query, count, signal, credential }) {
      const url = new URL(
        "search",
        credential.endsWith("/") ? credential : `${credential}/`,
      );
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      const response = await fetch(url, {
        signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(
          `SearXNG returned HTTP ${response.status} ${response.statusText}; check that the instance enables the json format`,
        );
      }
      const body = SearxngResponseSchema.parse(await response.json());
      return body.results.slice(0, count).map((result) => ({
        title: result.title,
        url: result.url,
        snippet: result.content ?? "",
        ...(result.publishedDate ? { published: result.publishedDate } : {}),
      }));
    },
  };
}
