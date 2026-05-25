// Fallback replacers for edit_file — when exact substring matching fails,
// these progressively looser strategies try to recover an LLM's intended
// match. Inspired by the multi-replacer approach used by OpenCode and
// cline:
//
//   https://github.com/sst/opencode (packages/opencode/src/tool/edit.ts)
//   https://github.com/cline/cline/blob/main/evals/diff-edits/diff-apply/
//
// Each replacer is a generator function that yields candidate substrings
// of the file content that should be treated as matches for the LLM's
// `oldText`. The caller (locateEditOccurrences in edit-file.utils.ts)
// runs them in priority order and uses the first one that yields a
// unique substring present in the snapshot.
//
// Rationale: LLMs frequently produce `oldText` that differs from the
// file in trivial ways — slightly off indentation, normalized whitespace,
// missing trailing newline. Strict exact-match alone makes the LLM
// retry the same approximate text forever ("the verifier said the
// edit didn't apply, I'll try the same thing again"). Fallback
// matchers let the tool say "I think you meant this exact block" and
// proceed, surfacing a `usedFallback` flag in the result so the LLM
// (and downstream code) know a heuristic recovered the call.

/** A candidate substring of the snapshot that should be treated as the match. */
export type ReplacerCandidate = string;

/**
 * A replacer generator. Yields zero or more candidate substrings of
 * `content` that should be treated as matches for `find`. The caller
 * filters to candidates that actually appear in `content` and picks
 * one as the match.
 */
export type Replacer = (
  content: string,
  find: string,
) => Generator<ReplacerCandidate, void, unknown>;

/**
 * Exact match (the strictest replacer). Yields `find` itself if it appears
 * in `content`, otherwise nothing. Equivalent to the original behaviour;
 * kept in the chain so the same code path covers exact and fallback cases.
 */
export const exactReplacer: Replacer = function* (content, find) {
  if (content.includes(find)) yield find;
};

/**
 * Line-trimmed match. Strips leading/trailing whitespace from each line
 * before comparison so the LLM's slightly-off indentation is forgiven.
 * Yields the *actual* unchanged substring of `content` that lines up,
 * so the eventual replacement preserves the file's original whitespace.
 */
export const lineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");

  // Drop a trailing empty line introduced by a terminal "\n" in find.
  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  if (searchLines.length === 0) return;

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      const originalTrimmed = originalLines[i + j]!.trim();
      const searchTrimmed = searchLines[j]!.trim();
      if (originalTrimmed !== searchTrimmed) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    // Reconstruct the exact substring of `content` from line i, length
    // `searchLines.length`. We walk character positions so newline
    // accounting stays correct.
    let matchStart = 0;
    for (let k = 0; k < i; k++) matchStart += originalLines[k]!.length + 1;
    let matchEnd = matchStart;
    for (let k = 0; k < searchLines.length; k++) {
      matchEnd += originalLines[i + k]!.length;
      if (k < searchLines.length - 1) matchEnd += 1;
    }
    yield content.substring(matchStart, matchEnd);
  }
};

/**
 * Block-anchor match. When `find` has ≥3 lines, find blocks in
 * `content` whose first and last lines (trimmed) equal the first and
 * last lines of `find` (trimmed). The middle is allowed to differ —
 * use this when the LLM gave us the right "envelope" but maybe wrote
 * the body slightly differently.
 *
 * Only emitted when there is exactly one block-anchor candidate, to
 * avoid silently picking the wrong location.
 */
export const blockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");

  if (searchLines[searchLines.length - 1] === "") {
    searchLines.pop();
  }
  if (searchLines.length < 3) return;

  const firstAnchor = searchLines[0]!.trim();
  const lastAnchor = searchLines[searchLines.length - 1]!.trim();

  const candidates: Array<{ startLine: number; endLine: number }> = [];
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i]!.trim() !== firstAnchor) continue;
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j]!.trim() === lastAnchor) {
        candidates.push({ startLine: i, endLine: j });
        break;
      }
    }
  }

  // Only yield when there is a single candidate. Multiple candidates
  // means we'd be guessing which block the LLM meant — refuse and let
  // the LLM disambiguate with a tighter `oldText`.
  if (candidates.length !== 1) return;

  const { startLine, endLine } = candidates[0]!;
  let matchStart = 0;
  for (let k = 0; k < startLine; k++)
    matchStart += originalLines[k]!.length + 1;
  let matchEnd = matchStart;
  for (let k = startLine; k <= endLine; k++) {
    matchEnd += originalLines[k]!.length;
    if (k < endLine) matchEnd += 1;
  }
  yield content.substring(matchStart, matchEnd);
};

/**
 * Whitespace-normalized match for SINGLE-LINE finds only. Collapses all
 * whitespace runs in both content and find to single spaces (trimmed),
 * then looks for the normalized find as a normalized line. Yields the
 * original (unchanged) line.
 *
 * Kept conservative — only handles single-line finds because multi-line
 * whitespace normalization gets ambiguous and merges with
 * `lineTrimmedReplacer`'s territory.
 */
export const whitespaceNormalizedReplacer: Replacer = function* (
  content,
  find,
) {
  const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();
  const normalizedFind = normalize(find);
  if (normalizedFind.length === 0) return;
  if (find.includes("\n")) return;

  const lines = content.split("\n");
  for (const line of lines) {
    if (normalize(line) === normalizedFind) {
      yield line;
      return; // first match only — same single-occurrence semantics as exact
    }
  }
};

/**
 * The default chain, applied in order. The first replacer to yield a
 * unique candidate wins. Order matters: stricter strategies come first
 * so that exact LLM intent is preferred over heuristic recovery.
 *
 * The chain is intentionally short (4 replacers, not OpenCode's 9).
 * Each extra replacer is another opportunity for a heuristic to
 * "succeed" on something the LLM didn't actually mean — over-eager
 * fallbacks risk silently editing the wrong block. These four cover
 * the trivial cases (indentation drift, single-line whitespace, block
 * envelopes) without venturing into Levenshtein territory.
 */
export const DEFAULT_REPLACER_CHAIN: readonly Replacer[] = [
  exactReplacer,
  lineTrimmedReplacer,
  whitespaceNormalizedReplacer,
  blockAnchorReplacer,
];

/**
 * Try the replacer chain in order and return the first unique candidate
 * substring that appears in `content`. Returns `undefined` if no
 * replacer yielded a candidate, or if every replacer that yielded
 * something yielded multiple distinct candidates (ambiguous).
 *
 * Distinguishes:
 * - "no candidates" → caller emits `old_text_not_found`.
 * - "ambiguous" (multiple distinct candidates from a replacer) →
 *   caller emits `multiple_matches` with the candidates so the LLM
 *   can disambiguate.
 *
 * @param content - The current file snapshot (normalized to LF).
 * @param find - The LLM-supplied `oldText` (normalized to LF).
 * @param replacers - Override the default chain (used by tests).
 */
export function findFallbackMatch(
  content: string,
  find: string,
  replacers: readonly Replacer[] = DEFAULT_REPLACER_CHAIN,
):
  | {
      match: string;
      replacerName: string;
      isExact: boolean;
    }
  | { ambiguous: readonly string[]; replacerName: string }
  | undefined {
  for (const replacer of replacers) {
    const candidates = new Set<string>();
    for (const candidate of replacer(content, find)) {
      if (content.includes(candidate)) candidates.add(candidate);
    }
    if (candidates.size === 0) continue;
    if (candidates.size === 1) {
      const match = candidates.values().next().value as string;
      return {
        match,
        replacerName: replacer.name || "anonymous",
        isExact: replacer === exactReplacer,
      };
    }
    // Multiple distinct candidates from a single replacer — ambiguous.
    return {
      ambiguous: [...candidates],
      replacerName: replacer.name || "anonymous",
    };
  }
  return undefined;
}
