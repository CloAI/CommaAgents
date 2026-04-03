/**
 * Resolve hooks for a given lifecycle point, handling initial vs regular
 * selection with fallback.
 *
 * On the first call (`isFirst = true`), the initial variant is preferred.
 * If not defined, falls back to the regular variant.
 * On subsequent calls, the regular variant is always used.
 */
export function resolveHook<HookType>(
  initialHooks: ReadonlyArray<HookType> | undefined,
  regularHooks: ReadonlyArray<HookType> | undefined,
  isFirst: boolean,
): ReadonlyArray<HookType> | undefined {
  if (isFirst) {
    return initialHooks ?? regularHooks;
  }
  return regularHooks;
}
