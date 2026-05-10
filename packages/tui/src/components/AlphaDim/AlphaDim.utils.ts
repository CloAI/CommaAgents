/**
 * RGB triple, channels in `[0, 255]`.
 */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * A row range expressed as half-open `[top, top + height)` in absolute frame
 * row coordinates (0 = top of the rendered frame).
 */
export interface RowRange {
  readonly top: number;
  readonly height: number;
}

/**
 * Scale every channel of an RGB triple by `factor`, clamped to `[0, 255]`.
 *
 * @example
 * scaleRgb({ r: 200, g: 100, b: 50 }, 0.4)
 * // → { r: 80, g: 40, b: 20 }
 */
export function scaleRgb(color: Rgb, factor: number): Rgb {
  return {
    r: clampChannel(color.r * factor),
    g: clampChannel(color.g * factor),
    b: clampChannel(color.b * factor),
  };
}

/**
 * Format an RGB triple as an SGR truecolor escape, either foreground (`38`) or background (`48`).
 *
 * @example
 * formatTruecolorSgr(38, { r: 80, g: 40, b: 20 })
 * // → "\x1b[38;2;80;40;20m"
 */
export function formatTruecolorSgr(kind: 38 | 48, color: Rgb): string {
  return `\x1b[${kind};2;${color.r};${color.g};${color.b}m`;
}

/**
 * Look up an xterm 256-color palette index and return its RGB value.
 *
 * Layout:
 * - `0–15`: standard ANSI named colors (terminal-defined; xterm defaults used)
 * - `16–231`: 6×6×6 cube where index `16 + 36r + 6g + b` maps via `[0, 95, 135, 175, 215, 255]`
 * - `232–255`: 24 grayscale ramps from `8` to `238` in steps of `10`
 */
export function xterm256ToRgb(index: number): Rgb {
  if (index < 0 || index > 255) {
    return { r: 0, g: 0, b: 0 };
  }
  if (index < 16) {
    return XTERM_BASE_16[index]!;
  }
  if (index < 232) {
    const n = index - 16;
    const r = Math.floor(n / 36);
    const g = Math.floor((n % 36) / 6);
    const b = n % 6;
    return {
      r: CUBE_LEVELS[r]!,
      g: CUBE_LEVELS[g]!,
      b: CUBE_LEVELS[b]!,
    };
  }
  const gray = 8 + (index - 232) * 10;
  return { r: gray, g: gray, b: gray };
}

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

const XTERM_BASE_16: readonly Rgb[] = [
  { r: 0, g: 0, b: 0 },
  { r: 128, g: 0, b: 0 },
  { r: 0, g: 128, b: 0 },
  { r: 128, g: 128, b: 0 },
  { r: 0, g: 0, b: 128 },
  { r: 128, g: 0, b: 128 },
  { r: 0, g: 128, b: 128 },
  { r: 192, g: 192, b: 192 },
  { r: 128, g: 128, b: 128 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
];

function clampChannel(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

/** SGR escape: `ESC [ <params> m`. */
const SGR_RE = /\x1b\[([0-9;]*)m/g;

/**
 * Apply dim transforms to a single line of row content (no `\n`):
 * - Rewrite every truecolor / 256-color SGR fg/bg param by scaling RGB.
 * - Pass non-color SGR params through (bold, italic, reset, etc.).
 * - If `prependDefaultBg` is true and the line is non-blank, prefix with the
 *   dim default-bg SGR and append a reset so cells without explicit bg
 *   inherit the dim backdrop.
 */
export function dimLineContent(
  line: string,
  factor: number,
  dimDefaultBg: Rgb,
  prependDefaultBg: boolean,
): string {
  const transformed = transformLineSgr(line, factor);
  if (!prependDefaultBg) return transformed;
  if (line.trim().length === 0) return transformed;
  return `${formatTruecolorSgr(48, dimDefaultBg)}${transformed}\x1b[0m`;
}

/**
 * Transform a full-frame chunk (chunk that contains `\n`-joined rows and
 * was emitted as a single unit by the standard non-incremental log-update
 * renderer).
 *
 * Splits on `\n` and dims each row independently, prepending the dim
 * default-bg to non-blank rows.
 */
export function dimFrame(
  frame: string,
  factor: number,
  dimDefaultBg: Rgb,
): string {
  return frame
    .split("\n")
    .map((line) => dimLineContent(line, factor, dimDefaultBg, true))
    .join("\n");
}

/**
 * Transform an incremental render chunk emitted by Ink's
 * `createIncremental` log-update.
 *
 * Incremental chunks have the structure (annotated):
 *
 * ```text
 *   <returnPrefix?>             // optional cursor-restore from prev frame
 *   <eraseLines(diff)?>         // when previous frame was taller
 *   \x1b[<N>A                   // cursorUp to top of current frame
 *   <per-row units>...          // exactly visibleCount of these
 *   <cursorSuffix?>             // optional show-cursor / position
 * ```
 *
 * Each per-row unit is one of:
 * - `\x1b[E`                    — `cursorNextLine`, row unchanged → advance row index
 * - `\x1b[1G<line>\x1b[K\n`     — `cursorTo(0) + line + eraseEndLine + \n` → rewrite row at current index
 * - `\x1b[1G<line>\x1b[K`       — same but no trailing `\n` (last row in fullscreen mode)
 *
 * Every per-row unit advances the row index by exactly 1, regardless of
 * which form it takes.
 *
 * Strategy: walk the row-loop region once, tracking row index. For each
 * rewrite unit, determine whether the row falls inside `protectedRange`.
 * If protected, emit unchanged. Otherwise dim the line content.
 *
 * Anything outside the row-loop region (returnPrefix, cursorUp, cursorSuffix)
 * is passed through unchanged.
 *
 * If the chunk doesn't match the expected structure (no `cursorUp` anchor),
 * returns `null` so the caller can fall back to other handling.
 *
 * @param chunk - The exact string Ink wrote.
 * @param factor - Channel scale factor.
 * @param dimDefaultBg - Pre-scaled dim default-bg RGB.
 * @param protectedRange - Row range that must NOT be dimmed (modal area).
 * @returns Transformed chunk, or `null` if structure not recognized.
 */
export function dimIncrementalChunk(
  chunk: string,
  factor: number,
  dimDefaultBg: Rgb,
  protectedRange: RowRange,
): string | null {
  const cursorUpMatch = chunk.match(/\x1b\[(\d+)A/);
  if (!cursorUpMatch || cursorUpMatch.index === undefined) return null;

  const anchorEnd = cursorUpMatch.index + cursorUpMatch[0].length;
  const prefix = chunk.slice(0, anchorEnd);
  const rest = chunk.slice(anchorEnd);

  // Walk the rest token-by-token. Each rewrite unit ends with either `\n`
  // or end-of-string. Each `cursorNextLine` (\x1b[E) is its own unit.
  const out: string[] = [prefix];
  let row = 0;
  let i = 0;

  while (i < rest.length) {
    // cursorNextLine: \x1b[E
    if (rest.startsWith("\x1b[E", i)) {
      out.push("\x1b[E");
      i += 3;
      row += 1;
      continue;
    }

    // Rewrite unit: \x1b[1G ... \x1b[K (\n)?
    if (rest.startsWith("\x1b[1G", i)) {
      // Find the end of this row unit: next \n, or end of string.
      const nlIdx = rest.indexOf("\n", i);
      const unitEnd = nlIdx === -1 ? rest.length : nlIdx + 1;
      const unit = rest.slice(i, unitEnd);
      const hasTrailingNewline = unit.endsWith("\n");
      // Strip leading \x1b[1G and trailing \x1b[K(\n)?
      const inner = stripRewriteWrappers(unit);
      const isProtected =
        row >= protectedRange.top &&
        row < protectedRange.top + protectedRange.height;
      const transformedInner = isProtected
        ? inner
        : dimLineContent(inner, factor, dimDefaultBg, true);
      out.push(
        "\x1b[1G",
        transformedInner,
        "\x1b[K",
        hasTrailingNewline ? "\n" : "",
      );
      i = unitEnd;
      row += 1;
      continue;
    }

    // Unknown content — emit one char and continue. This handles trailing
    // cursorSuffix data (cursor visibility, position) at the end of the chunk.
    out.push(rest[i]!);
    i += 1;
  }

  return out.join("");
}

/**
 * Given a rewrite unit `\x1b[1G<line>\x1b[K(\n)?`, strip the wrappers and
 * return only `<line>`.
 */
function stripRewriteWrappers(unit: string): string {
  let s = unit;
  if (s.startsWith("\x1b[1G")) s = s.slice("\x1b[1G".length);
  if (s.endsWith("\n")) s = s.slice(0, -1);
  if (s.endsWith("\x1b[K")) s = s.slice(0, -"\x1b[K".length);
  return s;
}

/**
 * Walk every SGR escape in a single line and rewrite color params.
 */
function transformLineSgr(line: string, factor: number): string {
  return line.replace(SGR_RE, (_match, params: string) => {
    const transformed = transformSgrParams(params, factor);
    return `\x1b[${transformed}m`;
  });
}

/**
 * Rewrite the parameter portion of a single SGR sequence.
 *
 * Color sub-sequences:
 * - `38;2;r;g;b` — truecolor fg
 * - `48;2;r;g;b` — truecolor bg
 * - `38;5;n`     — 256-color fg → output as truecolor
 * - `48;5;n`     — 256-color bg → output as truecolor
 *
 * All other params pass through unchanged. Multiple sub-sequences in one
 * SGR (e.g. `\x1b[1;38;2;200;100;50;48;2;0;0;0m`) are all rewritten.
 */
function transformSgrParams(params: string, factor: number): string {
  if (params.length === 0) return params;
  const tokens = params.split(";");
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i]!;
    const isFg = token === "38";
    const isBg = token === "48";
    const next = tokens[i + 1];

    if ((isFg || isBg) && next === "2" && i + 4 < tokens.length) {
      const r = parseChannel(tokens[i + 2]);
      const g = parseChannel(tokens[i + 3]);
      const b = parseChannel(tokens[i + 4]);
      const scaled = scaleRgb({ r, g, b }, factor);
      out.push(token, "2", String(scaled.r), String(scaled.g), String(scaled.b));
      i += 5;
      continue;
    }

    if ((isFg || isBg) && next === "5" && i + 2 < tokens.length) {
      const idx = parseChannel(tokens[i + 2]);
      const rgb = xterm256ToRgb(idx);
      const scaled = scaleRgb(rgb, factor);
      out.push(token, "2", String(scaled.r), String(scaled.g), String(scaled.b));
      i += 3;
      continue;
    }

    out.push(token);
    i += 1;
  }
  return out.join(";");
}

function parseChannel(token: string | undefined): number {
  if (token === undefined) return 0;
  const n = Number.parseInt(token, 10);
  if (Number.isNaN(n)) return 0;
  return clampChannel(n);
}
