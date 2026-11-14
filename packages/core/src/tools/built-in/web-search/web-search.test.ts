import { afterEach, describe, expect, it } from "vitest";

import { createCredentialStore } from "../../../credentials/credentials";
import {
  resetGlobalCredentialStore,
  setGlobalCredentialStore,
} from "../../../credentials/global-credential-store";
import type { CredentialStoreData } from "../../../credentials/credentials.types";
import { makeToolContext } from "../../test.utils";
import { createWebSearchTool } from "./web-search";
import type { WebSearchProvider, WebSearchRequest } from "./web-search.types";

function useCredentials(env: Readonly<Record<string, string>>): void {
  let data: CredentialStoreData = {};
  setGlobalCredentialStore(
    createCredentialStore({
      backend: {
        async readAll() {
          return structuredClone(data);
        },
        async writeAll(next) {
          data = structuredClone(next);
        },
      },
      env,
    }),
  );
}

function recordingProvider(
  name: string,
  credentialId: string,
  requests: WebSearchRequest[],
): WebSearchProvider {
  return {
    name,
    credentialId,
    async search(request) {
      requests.push(request);
      return [
        {
          title: "Bun 1.3",
          url: "https://bun.sh/blog",
          snippet: "Release notes",
          published: "2026-01-02",
        },
      ];
    },
  };
}

afterEach(resetGlobalCredentialStore);

describe("createWebSearchTool", () => {
  it("should use the first provider that has a credential", async () => {
    useCredentials({ SEARXNG_URL: "http://localhost:8080" });
    const requests: WebSearchRequest[] = [];
    const tool = createWebSearchTool({
      providers: [
        recordingProvider("brave", "brave-search", requests),
        recordingProvider("searxng", "searxng", requests),
      ],
    });
    const result = await tool.execute(
      { query: "bun release" },
      makeToolContext(),
    );

    expect(
      requests.map((request) => [request.credential, request.count]),
    ).toEqual([["http://localhost:8080", 8]]);
    expect(result.data?.provider).toBe("searxng");
    expect(result.output).toBe(
      'Results from searxng for "bun release":\n1. Bun 1.3\n   https://bun.sh/blog (2026-01-02)\n   Release notes',
    );
  });

  it("should explain how to configure search when no provider has a credential", async () => {
    useCredentials({});
    const tool = createWebSearchTool({
      providers: [recordingProvider("brave", "brave-search", [])],
    });
    const result = await tool.execute({ query: "anything" }, makeToolContext());

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe(
      "No web search backend is configured. Set one of: brave-search.",
    );
  });

  it("should report provider failures as recoverable", async () => {
    useCredentials({ BRAVE_SEARCH_API_KEY: "key" });
    const tool = createWebSearchTool({
      providers: [
        {
          name: "brave",
          credentialId: "brave-search",
          async search() {
            throw new Error("Brave Search returned HTTP 429 Too Many Requests");
          },
        },
      ],
    });
    const result = await tool.execute({ query: "anything" }, makeToolContext());

    expect(result.error).toMatchObject({ kind: "unknown", recoverable: true });
    expect(result.error?.message).toContain("HTTP 429");
  });
});
