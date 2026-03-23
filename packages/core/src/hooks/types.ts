// Shared hook infrastructure — generic types and runners.
//
// Domain-specific hook interfaces live with their domain:
//   AgentHooks, ToolHooks  → agents/hooks.ts
//   FlowHooks, CycleHooks  → flows/types.ts

/**
 * A side-effect hook that receives context but does not transform values.
 * Used for logging, metrics, state management, etc.
 */
export type SideEffectHook<T> = (value: T) => void | Promise<void>;

/**
 * A transform hook that receives a value and returns a (possibly modified) value.
 * Used for altering messages, responses, etc. The output of one hook becomes
 * the input of the next (chained).
 */
export type TransformHook<T> = (value: T) => T | Promise<T>;

/**
 * Execute an array of side-effect hooks in order.
 */
export async function runSideEffectHooks<T>(
  hooks: ReadonlyArray<SideEffectHook<T>> | undefined,
  value: T,
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
export async function runTransformHooks<T>(
  hooks: ReadonlyArray<TransformHook<T>> | undefined,
  value: T,
): Promise<T> {
  if (!hooks) return value;
  let current = value;
  for (const hook of hooks) {
    current = await hook(current);
  }
  return current;
}
