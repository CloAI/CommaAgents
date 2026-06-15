/** Return the combined input/output tokens from the final model step. */
export function contextTokensFromSteps(
  steps: readonly unknown[] | undefined,
): number | undefined {
  const lastStep = steps?.at(-1);
  if (typeof lastStep !== "object" || lastStep === null) return undefined;

  const usage = (lastStep as { readonly usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return undefined;

  const inputTokens = (usage as { readonly inputTokens?: unknown }).inputTokens;
  const outputTokens = (usage as { readonly outputTokens?: unknown })
    .outputTokens;
  if (typeof inputTokens !== "number" && typeof outputTokens !== "number") {
    return undefined;
  }

  return (
    (typeof inputTokens === "number" ? inputTokens : 0) +
    (typeof outputTokens === "number" ? outputTokens : 0)
  );
}

/** Build an optional wire field from an agent result's final model step. */
export function contextDetails(result: unknown): {
  readonly contextTokens?: number;
} {
  if (typeof result !== "object" || result === null) return {};
  const steps = (result as { readonly steps?: readonly unknown[] }).steps;
  const contextTokens = contextTokensFromSteps(steps);
  return contextTokens === undefined ? {} : { contextTokens };
}
