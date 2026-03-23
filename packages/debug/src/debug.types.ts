// Debug options — configuration for debugAgent and debugFlow.

/**
 * Options for debug logging output.
 *
 * @example
 * ```ts
 * debugAgent(agent, { truncate: 200, showSystemPrompt: false });
 * debugFlow(flow, { showTokens: false, output: myLogger });
 * ```
 */
export interface DebugOptions {
  /** Max characters for message/response previews. 0 = unlimited. @default 0 */
  readonly truncate?: number;
  /** Word-wrap lines at the last space before this column. 0 = no wrapping. @default 0 */
  readonly breakLineAfter?: number;
  /** Replace newlines with "\\n" for single-line previews. @default false */
  readonly collapseNewlines?: boolean;
  /** Print system prompt when describing an agent. @default true */
  readonly showSystemPrompt?: boolean;
  /** Print token usage per step/call. @default true */
  readonly showTokens?: boolean;
  /** Custom output function. @default console.log */
  readonly output?: (line: string) => void;
}

/** DebugOptions with all fields resolved to non-optional values. */
export interface ResolvedDebugOptions {
  readonly truncate: number;
  readonly breakLineAfter: number;
  readonly collapseNewlines: boolean;
  readonly showSystemPrompt: boolean;
  readonly showTokens: boolean;
  readonly output: (line: string) => void;
}
