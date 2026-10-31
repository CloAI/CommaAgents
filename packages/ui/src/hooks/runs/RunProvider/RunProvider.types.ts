import type { RunStop } from "../useRunStop/useRunStop.types";
import type { RunStrategy } from "../useRunStrategy/useRunStrategy.types";
import type { RunSubmission } from "../useRunSubmission/useRunSubmission.types";

/** Controls shared by every consumer of one followed run; they change rarely, unlike the feed. */
export interface RunControls {
  readonly runId: string;
  readonly submission: RunSubmission;
  readonly strategy: RunStrategy;
  readonly stop: RunStop;
}
