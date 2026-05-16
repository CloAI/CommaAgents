export interface WebFetchToolConfig {
  /** Default per-request timeout in seconds (default: 30). */
  readonly defaultTimeout?: number;
  /** Maximum length of the returned content in characters (default: 50_000). */
  readonly maxContentLength?: number;
  /** Custom user-agent header (default: "CommaAgents-WebFetch/1.0"). */
  readonly userAgent?: string;
}
