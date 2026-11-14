/** One web search hit. */
export interface WebSearchResult {
  /** Page title. */
  readonly title: string;
  /** Page URL. */
  readonly url: string;
  /** Short excerpt describing the page. */
  readonly snippet: string;
  /** Publication or last-update date as reported by the provider, when known. */
  readonly published?: string;
}

/** Inputs to a provider's search call. */
export interface WebSearchRequest {
  /** Search query text. */
  readonly query: string;
  /** Maximum number of results to return. */
  readonly count: number;
  /** Cancels the request. */
  readonly signal: AbortSignal;
  /** Secret or endpoint resolved from the credential store for this provider. */
  readonly credential: string;
}

/** A search backend that `web_search` can query. */
export interface WebSearchProvider {
  /** Provider name shown in results, e.g. `brave`. */
  readonly name: string;
  /** Credential store provider ID whose API key (or URL) configures this backend. */
  readonly credentialId: string;
  /** Run a search; throws on transport or provider errors. */
  search(request: WebSearchRequest): Promise<WebSearchResult[]>;
}

/** Options for {@link createWebSearchTool}. */
export interface WebSearchToolConfig {
  /** Backends tried in order; the first with a configured credential is used. @default [brave, searxng] */
  readonly providers?: readonly WebSearchProvider[];
}

/** Structured payload returned by `web_search.execute`. */
export interface WebSearchData {
  /** Provider that answered. */
  readonly provider: string;
  /** Query that was run. */
  readonly query: string;
  /** Results in provider ranking order. */
  readonly results: readonly WebSearchResult[];
}
