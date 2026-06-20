import type { ContextUsageWire } from "@comma-agents/daemon";

/** Payload carried when opening the context usage details modal. */
export interface ContextUsageModalPayload {
  /** Agent name shown in the modal title. */
  readonly agentName: string;
  /** Provider/model identifier used for the agent call. */
  readonly model?: string;
  /** Maximum context window for the model, when known. */
  readonly contextWindow?: number;
  /** Final model-step context usage to display. */
  readonly contextUsage: ContextUsageWire;
}
