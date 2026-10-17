import type { RunPhase } from "../runs.types";

export const allowedTransitions: Record<RunPhase, readonly RunPhase[]> = {
  preparing: ["preparing", "prepared"],
  prepared: ["running", "terminal"],
  running: ["terminal"],
  terminal: [],
};
