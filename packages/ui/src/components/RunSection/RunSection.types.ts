import type { RunContent } from "../../hooks/runs";

/** One original tool call. */
export type RunTool = Extract<RunContent, { type: "tool" }>;
