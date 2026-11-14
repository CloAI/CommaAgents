import type { z } from "zod/v4";
import type {
  ContextMessageSchema,
  SendRunArgumentsSchema,
  SendRunOutputSchema,
  StrategyStateSchema,
  SwitchStrategyArgumentsSchema,
} from "./switching.schemas";

/** Persisted strategy selections, model settings, and shared context boundary. */
export type RunStrategyState = z.infer<typeof StrategyStateSchema>;
/** Text from display history, attributed to its original speaker. */
export type ContextMessage = z.infer<typeof ContextMessageSchema>;
/** Explicit selection; stopping active execution requires the caller's choice. */
export type SwitchStrategyOptions = z.input<
  typeof SwitchStrategyArgumentsSchema
>;
/** Submit a continuation with an optional explicit context decision. */
export type SendRunOptions = z.input<typeof SendRunArgumentsSchema>;
/** Submission acknowledgement or a context decision required before execution. */
export type SendRunResult = z.infer<typeof SendRunOutputSchema>;
