import type { ConversationRecord } from "../../conversation-context.types";
import {
  CHARACTERS_PER_TOKEN,
  COMPACTION_SECTIONS,
} from "./compaction.constants";

/**
 * Build the instruction that asks a model for a structured handoff summary.
 *
 * @param {readonly string[]} [extraSections] - Section headings appended after the standard ones.
 * @returns {string} Instruction text placed after the conversation being summarized.
 * @example
 * ```ts
 * const instruction = buildCompactionInstruction(["Plan status"]);
 * ```
 */
export function buildCompactionInstruction(
  extraSections: readonly string[] = [],
): string {
  const sections = [...COMPACTION_SECTIONS, ...extraSections].map(
    (section) => `## ${section}`,
  );
  return [
    "Summarize the conversation above as a handoff. If it begins with an earlier summary, update that summary: keep everything still true, move finished work to Done, and drop only what is obsolete.",
    "",
    "Use these sections in this order, omitting any that would be empty:",
    ...sections,
    "",
    "Rules:",
    "- Keep exact identifiers: file paths, symbols, commands, error messages, URLs, versions, and numbers.",
    "- Under Relevant files, list at most 15 files, each with why it matters.",
    "- If the conversation contains a strategy switch, say which strategy is current under Constraints and preferences.",
    "- Leave out project instructions and environment details; the agent receives current versions separately.",
    "- Write facts, not instructions to the agent. Do not mention that this is a summary.",
  ].join("\n");
}

/**
 * Estimate a record's size in tokens from the text of its messages.
 * @param {ConversationRecord} record - Record to measure.
 * @returns {number} Estimated tokens.
 */
export function estimateRecordTokens(record: ConversationRecord): number {
  return Math.ceil(
    JSON.stringify([record.userMessage, record.responseMessages]).length /
      CHARACTERS_PER_TOKEN,
  );
}

/**
 * Count how many of the newest records fit in a token budget, keeping at least one.
 * Records are whole agent calls, so tool calls are never separated from their results.
 * @param {readonly ConversationRecord[]} records - Active records, oldest first.
 * @param {number} tokenBudget - Estimated tokens to keep verbatim.
 * @returns {number} Count of newest records to keep.
 */
export function recentRecordCountWithinTokens(
  records: readonly ConversationRecord[],
  tokenBudget: number,
): number {
  let total = 0;
  let count = 0;
  for (let recordIndex = records.length - 1; recordIndex >= 0; recordIndex--) {
    total += estimateRecordTokens(records[recordIndex]!);
    if (count > 0 && total > tokenBudget) break;
    count += 1;
  }
  return count;
}
