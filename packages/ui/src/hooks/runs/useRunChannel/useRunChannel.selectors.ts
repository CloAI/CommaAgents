import type {
  RunChild,
  RunFeedState,
  RunStatusView,
} from "./useRunChannel.types";

/**
 * Describe where the run stands: a reported failure first, then the latest snapshot.
 * @param {RunFeedState} feed - Channel state.
 * @returns {RunStatusView} Status and failure reason.
 */
export function selectRunStatus({
  failure,
  snapshot,
}: RunFeedState): RunStatusView {
  if (failure) return { status: "failed", error: failure };
  if (!snapshot) return { status: "loading" };
  if (snapshot.phase === "prepared") return { status: "prepared" };
  if (snapshot.phase !== "terminal") return { status: "running" };
  switch (snapshot.outcome.status) {
    case "completed":
      return { status: "completed" };
    case "failed":
      return {
        status: "failed",
        error: `Run failed (${snapshot.outcome.error.code}).`,
      };
    default:
      return { status: "stopped" };
  }
}

/**
 * Name a child run for display: its strategy name, or the strategy file's name while it loads.
 * @param {RunChild} child - Child run reference.
 * @returns {string} Display name.
 */
export function childLabel(child: RunChild): string {
  const name = child.strategyName;
  if (!name.includes("/")) return name;
  const fileName = name.split("/").at(-1) ?? name;
  return fileName.replace(/\.(jsonc?|ya?ml)$/i, "");
}

/**
 * Describe where a child run stands.
 * @param {RunChild} child - Child run reference.
 * @returns {string} `running` until it ends, then its outcome.
 */
export function childStatus(child: RunChild): string {
  return child.phase === "terminal" ? child.outcome : "running";
}
