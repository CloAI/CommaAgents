// Client → Daemon: resume_run
// Resume a previously stopped/cancelled/interrupted run.

import { z } from "zod";
import { ClientBase } from "../../shared";

export const ResumeRunMessage = ClientBase.extend({
  type: z.literal("resume_run"),
  /** The run ID to resume. */
  runId: z.string().min(1),
  /** Optional model override for agents during this resume session. */
  modelOverride: z.string().min(1).optional(),
});

export type ResumeRunMessage = z.infer<typeof ResumeRunMessage>;
