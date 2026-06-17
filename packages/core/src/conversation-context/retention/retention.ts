import type { ConversationRecord } from "../conversation-context.types";
import { applyCompaction } from "./compaction";
import type {
  CompactionOptions,
  ContextRecordTransform,
  ContextRetentionOptions,
  ContextTransformInput,
  RollingWindowOptions,
} from "./retention.types";
import { applyRollingWindow } from "./rolling-window";

/**
 * Prepare conversation records before an agent call by applying built-in
 * retention options and any custom transforms.
 *
 * @param options - Context retention and transform options.
 * @param input - Current records plus the owning agent name.
 */
export async function prepareContextRecords(
  options: ContextRetentionOptions,
  input: ContextTransformInput,
): Promise<readonly ConversationRecord[]> {
  let records = input.records;

  if (options.compaction) {
    records = await applyCompaction(
      records,
      resolveCompactionOptions(options.compaction),
      input.agentName,
    );
  }

  if (options.rollingWindow !== undefined) {
    records = applyRollingWindow(
      records,
      resolveRollingWindowOptions(options.rollingWindow),
    );
  }

  for (const transformRecords of contextTransforms(options.transformRecords)) {
    records = await transformRecords({ ...input, records });
  }

  return records;
}

function resolveRollingWindowOptions(
  options: number | RollingWindowOptions,
): RollingWindowOptions {
  if (typeof options === "number") return { maxRecords: options };
  return options;
}

function resolveCompactionOptions(
  options: true | CompactionOptions,
): CompactionOptions {
  if (options === true) return {};
  return options;
}

function contextTransforms(
  transformRecords:
    | ContextRecordTransform
    | readonly ContextRecordTransform[]
    | undefined,
): readonly ContextRecordTransform[] {
  if (transformRecords === undefined) return [];
  if (typeof transformRecords === "function") return [transformRecords];
  return transformRecords;
}
