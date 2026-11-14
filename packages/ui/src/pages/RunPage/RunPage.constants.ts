import type { ComposerMode, RunStatus } from "../../hooks/runs";

/** What the status line says for each state that needs no further detail. */
export const STATUS_LABELS: Record<Exclude<RunStatus, "failed">, string> = {
  loading: "",
  prepared: "",
  running: "Running...",
  completed: "Done.",
  stopped: "Stopped.",
};

/** Composer placeholder for what a message does. */
export const COMPOSER_PLACEHOLDERS: Record<ComposerMode, string> = {
  continue: "Continue the conversation...",
  reply: "Reply to the agent...",
  steer: "Steer the agent...",
};
