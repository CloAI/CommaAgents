import { findFallbackMatch } from "./edit-file.replacers";
import type { AppliedEdit, MatchRange } from "./edit-file.types";

interface PlannedReplacement {
  readonly editIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly newText: string;
}

/** Outcome details for a single edit, surfaced into the AppliedEdit return. */
interface EditMatchOutcome {
  /** The actual substring matched in the snapshot (post-fallback if used). */
  readonly matchedText: string;
  /** Which replacer in the chain produced this match. */
  readonly replacerName: string;
  /** True iff the match was found via exact substring lookup (no fallback). */
  readonly isExact: boolean;
}

/**
 * Compute 1-indexed line numbers spanning a (start, end) character offset
 * pair in `text`. End is exclusive; an edit ending at a newline counts
 * the line containing that newline.
 */
export function offsetsToLineRange(
  text: string,
  startOffset: number,
  endOffset: number,
): { startLine: number; endLine: number } {
  let startLine = 1;
  for (let i = 0; i < startOffset; i++) {
    if (text.charCodeAt(i) === 10) startLine++;
  }
  let endLine = startLine;
  const lastIndex = Math.max(startOffset, endOffset - 1);
  for (let i = startOffset; i < lastIndex; i++) {
    if (text.charCodeAt(i) === 10) endLine++;
  }
  return { startLine, endLine };
}

/** Find every occurrence of `needle` in `haystack` and return start offsets. */
export function findAllOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const offsets: number[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition -- intentional infinite loop with break
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    offsets.push(idx);
    from = idx + needle.length;
  }
  return offsets;
}

/**
 * Locate every occurrence of each edit's `oldText` in the snapshot, verify
 * match counts, and build the planned replacements list.
 *
 * Matching is tiered:
 *
 * 1. **Exact substring.** The strict legacy behaviour — `oldText` is
 *    matched character-for-character. If found, use it.
 * 2. **Fallback chain.** If exact match yields zero hits, the
 *    `DEFAULT_REPLACER_CHAIN` (line-trimmed → whitespace-normalized →
 *    block-anchor) is tried in priority order. The first replacer to
 *    produce a *unique* candidate substring of the snapshot wins.
 *    `expectedOccurrences > 1` disables fallback entirely (because the
 *    LLM is asking for batch replacement of a literal string).
 *
 * Returns `{ planned, appliedEdits }` on success, or a `ToolError`-shaped
 * object on failure. `AppliedEdit` carries a `usedFallback` flag and the
 * `replacerName` so callers can surface the heuristic to the LLM.
 */
export function locateEditOccurrences(
  snapshot: string,
  edits: readonly {
    oldText: string;
    newText: string;
    expectedOccurrences?: number;
  }[],
  filePath: string,
):
  | {
      planned: PlannedReplacement[];
      appliedEdits: AppliedEdit[];
    }
  | {
      errorKind: "old_text_not_found" | "multiple_matches";
      errorMessage: string;
      errorDetails: Record<string, unknown>;
    } {
  const planned: PlannedReplacement[] = [];
  const appliedEdits: AppliedEdit[] = [];

  for (let editIndex = 0; editIndex < edits.length; editIndex++) {
    const edit = edits[editIndex]!;
    const expected = edit.expectedOccurrences ?? 1;
    const oldNormalized = stripBomToLF(edit.oldText);
    const newNormalized = stripBomToLF(edit.newText);
    const offsets = findAllOccurrences(snapshot, oldNormalized);

    // Path 1: exact substring matched the expected number of times.
    if (offsets.length === expected) {
      for (const off of offsets) {
        planned.push({
          editIndex,
          startOffset: off,
          endOffset: off + oldNormalized.length,
          newText: newNormalized,
        });
      }
      appliedEdits.push({
        editIndex,
        occurrences: offsets.length,
        usedFallback: false,
        replacerName: "exactReplacer",
      });
      continue;
    }

    // Path 2: exact match found nothing AND the LLM asked for a single
    // replacement (expected === 1). Try the fallback chain — the LLM
    // probably has slightly off whitespace or indentation. Skip
    // fallbacks for expected > 1 because batch replacement is
    // inherently a "match literal text N times" operation.
    if (offsets.length === 0 && expected === 1) {
      const fallback = findFallbackMatch(snapshot, oldNormalized);
      if (fallback && "match" in fallback && !fallback.isExact) {
        const matchStart = snapshot.indexOf(fallback.match);
        if (matchStart !== -1) {
          planned.push({
            editIndex,
            startOffset: matchStart,
            endOffset: matchStart + fallback.match.length,
            newText: newNormalized,
          });
          appliedEdits.push({
            editIndex,
            occurrences: 1,
            usedFallback: true,
            replacerName: fallback.replacerName,
            matchedText: fallback.match,
          });
          continue;
        }
      }
      if (fallback && "ambiguous" in fallback) {
        // The fallback found multiple candidates — surface them so the
        // LLM can tighten `oldText` rather than guess.
        const matchRanges: MatchRange[] = fallback.ambiguous.map((cand) => {
          const off = snapshot.indexOf(cand);
          const { startLine, endLine } = offsetsToLineRange(
            snapshot,
            off,
            off + cand.length,
          );
          return {
            startLine,
            endLine,
            startOffset: off,
            endOffset: off + cand.length,
          };
        });
        return {
          errorKind: "multiple_matches",
          errorMessage:
            `Edit #${editIndex}: \`oldText\` matched no exact substring of ${filePath}, ` +
            `but ${fallback.ambiguous.length} block candidates were found via fallback ` +
            `(${fallback.replacerName}). Tighten \`oldText\` with more surrounding context to pick one.`,
          errorDetails: {
            editIndex,
            replacerName: fallback.replacerName,
            matchCount: fallback.ambiguous.length,
            matchRanges,
          },
        };
      }

      // No exact, no fallback — genuinely not in the file.
      return {
        errorKind: "old_text_not_found",
        errorMessage:
          `Edit #${editIndex}: \`oldText\` not found in ${filePath}. ` +
          `Re-read the file and copy the exact text you want to replace, ` +
          `or pass \`oldText\` that uniquely identifies the block (multi-line is fine).`,
        errorDetails: { editIndex },
      };
    }

    // Path 3: exact match found, but not the expected number of times.
    // Surface the actual locations so the LLM can either tighten
    // `oldText` or raise `expectedOccurrences`.
    if (offsets.length === 0) {
      return {
        errorKind: "old_text_not_found",
        errorMessage: `Edit #${editIndex}: \`oldText\` not found in ${filePath}.`,
        errorDetails: { editIndex },
      };
    }

    const matchRanges: MatchRange[] = offsets.map((off) => {
      const { startLine, endLine } = offsetsToLineRange(
        snapshot,
        off,
        off + oldNormalized.length,
      );
      return {
        startLine,
        endLine,
        startOffset: off,
        endOffset: off + oldNormalized.length,
      };
    });
    return {
      errorKind: "multiple_matches",
      errorMessage:
        `Edit #${editIndex}: expected ${expected} match(es) for \`oldText\` in ${filePath}, ` +
        `found ${offsets.length}. Tighten \`oldText\` with more surrounding context, ` +
        `or set \`expectedOccurrences: ${offsets.length}\` to replace every match.`,
      errorDetails: {
        editIndex,
        matchCount: offsets.length,
        expectedOccurrences: expected,
        matchRanges,
      },
    };
  }

  return { planned, appliedEdits };
}

/**
 * Detect overlapping replacement ranges. Returns the conflicting edit indices
 * if any overlap is found, or `undefined` if all ranges are disjoint.
 */
export function detectOverlappingEdits(
  planned: readonly PlannedReplacement[],
): number[] | undefined {
  const sortedByStart = [...planned].sort(
    (a, b) => a.startOffset - b.startOffset,
  );
  for (let i = 1; i < sortedByStart.length; i++) {
    const prev = sortedByStart[i - 1]!;
    const cur = sortedByStart[i]!;
    if (cur.startOffset < prev.endOffset) {
      return Array.from(new Set([prev.editIndex, cur.editIndex])).sort(
        (a, b) => a - b,
      );
    }
  }
  return undefined;
}

/**
 * Apply all planned replacements deterministically (descending by start offset).
 * Each replacement splices into a working copy of the snapshot.
 */
export function applyReplacements(
  snapshot: string,
  planned: readonly PlannedReplacement[],
): string {
  const replaceOrder = [...planned].sort(
    (a, b) => b.startOffset - a.startOffset,
  );
  let working = snapshot;
  for (const replacement of replaceOrder) {
    working =
      working.slice(0, replacement.startOffset) +
      replacement.newText +
      working.slice(replacement.endOffset);
  }
  return working;
}

/** Normalize text to LF line endings and strip BOM — used for edit matching. */
function stripBomToLF(text: string): string {
  let result = text;
  if (result.charCodeAt(0) === 0xfeff) {
    result = result.slice(1);
  }
  return result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Re-export for outcome reporting. */
export type { EditMatchOutcome };
