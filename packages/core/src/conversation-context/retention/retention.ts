import { applyCompaction } from "./compaction";
import type {
  CompactionOptions,
  ContextRecordTransform,
  ContextRetentionOptions,
  ContextRetentionResult,
  ContextTransformInput,
  ConversationRetentionEvent,
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
): Promise<ContextRetentionResult> {
  let records = input.records;
  const events: ConversationRetentionEvent[] = [];

  if (options.compaction) {
    const result = await applyCompaction({
      records,
      options: resolveCompactionOptions(options.compaction),
      agentName: input.agentName,
      trigger: {
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.contextUsage !== undefined
          ? { contextUsage: input.contextUsage }
          : {}),
        ...(input.contextWindow !== undefined
          ? { contextWindow: input.contextWindow }
          : {}),
        ...(input.maxInputTokens !== undefined
          ? { maxInputTokens: input.maxInputTokens }
          : {}),
        ...(input.maxInputTokens !== undefined ||
        input.contextWindow !== undefined
          ? { tokenLimit: input.maxInputTokens ?? input.contextWindow }
          : {}),
      },
    });
    records = result.records;
    if (result.event !== undefined) events.push(result.event);
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

  return { records, events };
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
