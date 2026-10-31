import type { RunContent } from "../../hooks/runs";

/** One original tool call. */
export type RunTool = Extract<RunContent, { type: "tool" }>;

/** A chronological display item retaining its original content objects. */
export type RunDisplayBlock =
  | {
      /** Consecutive tools, including a single call while streaming. */
      readonly type: "tools";
      /** Identity of the first call, stable as more calls arrive. */
      readonly key: string;
      /** Original calls in content order. */
      readonly tools: readonly RunTool[];
    }
  | {
      /** Visible prose or reasoning. */
      readonly type: "content";
      /** Original position, stable during streaming. */
      readonly key: string;
      /** Original non-tool block. */
      readonly content: Exclude<RunContent, { type: "tool" }>;
    };
