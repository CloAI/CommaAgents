import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";

/** Explicit context treatment chosen before sending. */
export type ContextChoice = "compact" | "recent" | "full";
/** Estimated context budget and alternatives supplied by the daemon. */
export type ContextRequest = Extract<
  DaemonCommandMap["runs.send"]["result"],
  { type: "context_required" }
>;

/** A continuation that remains pending through context selection and model acceptance. */
export interface RunSubmission {
  /** Settle once accepted, or with why the draft was kept. */
  readonly send: (input: string) => Promise<string | undefined>;
  /** Context choice currently being presented. */
  readonly dialog: ContextRequest | undefined;
  /** Resume submission with an explicit context choice. */
  readonly choose: (choice: ContextChoice) => void;
  /** Cancel pending submission or context selection while preserving the draft. */
  readonly cancel: () => void;
  /** Whether a submission or context choice is pending. */
  readonly isSubmitting: boolean;
}
