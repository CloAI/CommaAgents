/**
 * A side-effect hook that receives context but does not transform values.
 * Used for logging, metrics, state management, etc.
 */
export type SideEffectHook<HookValue> = (
  value: HookValue,
) => void | Promise<void>;

/**
 * A transform hook that receives a value and returns a (possibly modified) value.
 * Used for altering messages, responses, etc. The output of one hook becomes
 * the input of the next (chained).
 */
export type TransformHook<HookValue> = (
  value: HookValue,
) => HookValue | Promise<HookValue>;
