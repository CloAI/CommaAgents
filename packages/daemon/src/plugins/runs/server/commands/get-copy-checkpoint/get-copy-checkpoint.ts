import { defineCommand } from "../../../../../daemon-plugin";
import type { CommandContext } from "../../../../../daemon-plugin";
import type { RunsPlugin } from "../../../runs.types";
import {
  GetCopyCheckpointArgumentsSchema,
  GetCopyCheckpointOutputSchema,
} from "./get-copy-checkpoint.schemas";

/** Inspect a stable copy boundary, converting its internal Date at the wire boundary. */
export const getCopyCheckpointCommand = defineCommand({
  name: "runs.getCopyCheckpoint",
  arguments: GetCopyCheckpointArgumentsSchema,
  output: GetCopyCheckpointOutputSchema,
  async handle({
    plugin,
    arguments: { runId },
  }: CommandContext<RunsPlugin, unknown, { runId: string }>) {
    const checkpoint = await plugin.getCopyCheckpoint(runId);
    return {
      checkpoint: checkpoint
        ? {
            ...checkpoint,
            completedAt: checkpoint.completedAt.toISOString(),
            runIds: [...checkpoint.runIds],
          }
        : null,
    };
  },
});
