import type {
  CreateProjectsPluginOptions,
  ChatAttention,
} from "./projects.types";

/**
 * Read root and descendant attention through public feature APIs.
 * @param {CreateProjectsPluginOptions["dependencies"]} dependencies - Run and interaction services.
 * @param {string} runId - Root conversation identity.
 * @returns {Promise<ChatAttention>} Current execution and pending interaction status.
 */
export async function getChatAttention(
  dependencies: CreateProjectsPluginOptions["dependencies"],
  runId: string,
): Promise<ChatAttention> {
  const snapshot = await dependencies.runs.getRun(runId);
  const running =
    snapshot?.phase === "running" ||
    snapshot?.phase === "preparing" ||
    dependencies.runs
      .listActiveRuns()
      .some(
        (active) =>
          active.runId === runId ||
          dependencies.runs
            .getRunLineage(active.runId)
            .some((identity) => identity.runId === runId),
      );
  return {
    running,
    question: dependencies.questions.getPendingQuestions(runId).length > 0,
    permission: dependencies.sandbox.getPendingPermissions(runId).length > 0,
    failed:
      snapshot?.phase === "terminal" && snapshot.outcome.status === "failed",
  };
}
