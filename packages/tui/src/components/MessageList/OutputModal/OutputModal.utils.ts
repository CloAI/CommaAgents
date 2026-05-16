import { OUTPUT_MODAL_GREP_LINE_CAP } from "./OutputModal.constants";
import type {
  OutputModalLine,
  OutputModalLineSegment,
  OutputModalQuery,
} from "./OutputModal.types";

export function compileQuery(raw: string): OutputModalQuery {
  if (raw.trim().length === 0) {
    return { raw, regex: null, invalid: false };
  }
  try {
    const regex = new RegExp(raw, "gi");
    return { raw, regex, invalid: false };
  } catch {
    return { raw, regex: null, invalid: true };
  }
}

/**
 * Attempt to pretty-print a body that looks like JSON.
 *
 * Many tool results return minified JSON on a single line. If the body
 * parses as JSON and the original is a single line (or nearly so), we
 * return the indented form so the modal renders a readable structure.
 * Returns the original body unchanged when:
 * - parsing fails (not JSON)
 * - the body is already multi-line (already formatted)
 * - the pretty-printed version exceeds a generous size limit
 */
function preprocessBody(body: string): string {
  if (body.includes("\n")) return body;
  try {
    const parsed = JSON.parse(body);
    const formatted = JSON.stringify(parsed, null, 2);
    if (formatted.length > body.length * 5) return body;
    return formatted;
  } catch {
    return body;
  }
}

export function filterAndHighlight(
  body: string,
  regex: RegExp | null,
): readonly OutputModalLine[] {
  const preprocessed = preprocessBody(body);
  const allLines = preprocessed.split("\n");
  const lines = allLines.slice(0, OUTPUT_MODAL_GREP_LINE_CAP);

  if (regex === null) {
    return lines.map((text, index) => ({
      lineNumber: index + 1,
      segments: [{ text, isMatch: false }],
    }));
  }

  const result: OutputModalLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? "";
    const segments = segmentLine(text, regex);
    if (segments.some((segment) => segment.isMatch)) {
      result.push({ lineNumber: index + 1, segments });
    }
  }
  return result;
}

/**
 * Split a single line into alternating non-match / match runs based
 * on `regex`. The regex must carry the global flag — without it the
 * loop won't advance past the first match. We re-`new RegExp` on the
 * source/flags to defensively isolate per-line state in case the
 * caller reuses a stateful regex from {@link compileQuery}.
 *
 * Zero-length matches are skipped explicitly: regexes like `^` or
 * `(?=)` can hit at every offset and would loop forever.
 */
function segmentLine(
  text: string,
  regex: RegExp,
): readonly OutputModalLineSegment[] {
  if (text.length === 0) {
    return [{ text: "", isMatch: false }];
  }
  const safe = new RegExp(regex.source, ensureGlobal(regex.flags));
  const out: OutputModalLineSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null = safe.exec(text);
  while (match !== null) {
    if (match[0].length === 0) {
      // Avoid infinite loop on zero-length matches; bail to "no match".
      return [{ text, isMatch: false }];
    }
    if (match.index > cursor) {
      out.push({ text: text.slice(cursor, match.index), isMatch: false });
    }
    out.push({ text: match[0], isMatch: true });
    cursor = match.index + match[0].length;
    match = safe.exec(text);
  }
  if (cursor < text.length) {
    out.push({ text: text.slice(cursor), isMatch: false });
  }
  return out.length > 0 ? out : [{ text, isMatch: false }];
}

/**
 * Ensure the regex flag string contains `g`. We don't strip other
 * flags (case-insensitivity, unicode) supplied by the caller.
 */
function ensureGlobal(flags: string): string {
  return flags.includes("g") ? flags : `${flags}g`;
}
