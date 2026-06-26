import type { AgentStreamEventWire } from "@comma-agents/daemon";

/**
 * Visual state of a tool call.
 *
 * - `running`   — call sent, no paired result yet (implicit on the
 *   wire; the result segment simply hasn't arrived).
 * - `completed` — paired tool-result with `status: "completed"`.
 * - `error`     — paired tool-result with `status: "error"` (mapped
 *   from the AI SDK `tool-error` part by `mapStreamPart`).
 */
type ToolResultEvent = Extract<
  AgentStreamEventWire,
  { readonly type: "tool-result" }
>;

export type ToolCallViewStatus = "running" | ToolResultEvent["status"];

/**
 * Map a wire-level tool-call/tool-result pairing to the renderer's
 * status. When `result` is absent the call is still in flight; when
 * present its `status` field decides between `completed` and `error`.
 */
export function deriveToolCallViewStatus(
  result: Pick<ToolResultEvent, "status"> | undefined,
): ToolCallViewStatus {
  if (result === undefined) return "running";
  return result.status;
}
