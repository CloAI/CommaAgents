import type { RunsContext } from "../../../state/state.types";

/**
 * Reserve one run's lifecycle transition without holding it for strategy execution.
 * @param {RunsContext} context - Current command reservations.
 * @param {string} runId - Conversation being changed.
 * @param {() => Result | Promise<Result>} operation - Preparation or execution acceptance.
 * @returns {Promise<Result>} Command result.
 * @internal
 */
export function acceptRunCommand<Result>(
  context: RunsContext,
  runId: string,
  operation: () => Result | Promise<Result>,
): Promise<Result> {
  if (context.commands.has(runId)) {
    throw Object.assign(
      new Error(`A lifecycle command is already in progress: ${runId}`),
      { code: "RUN_BUSY" },
    );
  }
  const pending = Promise.resolve(operation());
  context.commands.set(runId, pending);
  function release(): void {
    if (context.commands.get(runId) === pending) {
      context.commands.delete(runId);
    }
  }
  void pending.then(release, release);
  return pending;
}
