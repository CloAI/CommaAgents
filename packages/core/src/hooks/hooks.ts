import type { SideEffectHook, TransformHook } from "./hooks.types";

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
