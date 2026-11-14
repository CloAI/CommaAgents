import type { GlobData } from "./glob.types";

/**
 * Format paths with explicit completion information.
 * @param {GlobData} data - Matched entries and completeness information.
 * @returns {string} Model-facing paths and completion summary.
 */
export function formatGlobResults(data: GlobData): string {
  const status = data.truncated
    ? `Incomplete: ${data.incompleteReasons.join(", ")}. Narrow the pattern or root.`
    : "Complete.";
  const header = `${data.matches.length} matches. ${status}`;
  return [
    header,
    ...data.matches.map(
      (match) =>
        `${match.path}${match.type === "directory" ? "/" : ""} (${match.type})`,
    ),
  ].join("\n");
}
