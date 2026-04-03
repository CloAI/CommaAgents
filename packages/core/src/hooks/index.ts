// Shared hook infrastructure — generic types and runners.
//
// Domain-specific hook interfaces live with their domain:
//   AgentHooks, ToolHooks  → agents/hooks.ts
//   FlowHooks, CycleHooks  → flows/types.ts

/**
 * A side-effect hook that receives context but does not transform values.
 * Used for logging, metrics, state management, etc.
 */
export type SideEffectHook<HookValue> = (value: HookValue) => void | Promise<void>;

/**
 * A transform hook that receives a value and returns a (possibly modified) value.
 * Used for altering messages, responses, etc. The output of one hook becomes
 * the input of the next (chained).
 */
export type TransformHook<HookValue> = (value: HookValue) => HookValue | Promise<HookValue>;

/**
 * Execute an array of side-effect hooks in order.
 */
export async function runSideEffectHooks<HookValue>(
  hooks: ReadonlyArray<SideEffectHook<HookValue>> | undefined,
  value: HookValue,
): Promise<void> {
  if (!hooks) return;
  for (const hook of hooks) {
    await hook(value);
  }
}

/**
 * Execute an array of transform hooks in order, chaining outputs.
 * Returns the final transformed value.
 */
export async function runTransformHooks<HookValue>(
  hooks: ReadonlyArray<TransformHook<HookValue>> | undefined,
  value: HookValue,
): Promise<HookValue> {
  if (!hooks) return value;
  let current = value;
  for (const hook of hooks) {
    current = await hook(current);
  }
  return current;
}
