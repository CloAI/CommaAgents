import type { PrepareRunOptions } from "../runs.types";

/**
 * Identify matching preparation settings for request coalescing.
 * @param {PrepareRunOptions} options - Requested run and strategy settings.
 * @returns {string} Stable key for these settings.
 * @internal
 */
export function preparationKey({
  runId,
  strategyPath,
  cwd,
  manifestPath,
  modelOverride,
}: PrepareRunOptions): string {
  return JSON.stringify([
    runId,
    strategyPath,
    cwd,
    manifestPath,
    modelOverride,
  ]);
}
