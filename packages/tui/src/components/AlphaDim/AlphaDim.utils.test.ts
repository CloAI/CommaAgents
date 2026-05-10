import { describe, expect, test } from "bun:test";

import {
  dimFrame,
  dimIncrementalChunk,
  formatTruecolorSgr,
  scaleRgb,
  xterm256ToRgb,
} from "./AlphaDim.utils";

describe("scaleRgb", () => {
  test("scales each channel by factor", () => {
    expect(scaleRgb({ r: 200, g: 100, b: 50 }, 0.5)).toEqual({
      r: 100,
      g: 50,
      b: 25,
    });
  });

  test("clamps to 0-255 range", () => {
    expect(scaleRgb({ r: 300, g: -10, b: 100 }, 1)).toEqual({
      r: 255,
      g: 0,
      b: 100,
    });
  });

  test("factor of 0 produces black", () => {
    expect(scaleRgb({ r: 200, g: 100, b: 50 }, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("xterm256ToRgb", () => {
  test("base 16 ANSI palette returns expected RGB", () => {
    expect(xterm256ToRgb(0)).toEqual({ r: 0, g: 0, b: 0 });
    expect(xterm256ToRgb(15)).toEqual({ r: 255, g: 255, b: 255 });
  });

  test("6x6x6 cube indexes resolve via lookup levels", () => {
    // index 16 = (0,0,0) cube corner = pure black
    expect(xterm256ToRgb(16)).toEqual({ r: 0, g: 0, b: 0 });
    // index 231 = (5,5,5) cube corner = pure white truecolor
    expect(xterm256ToRgb(231)).toEqual({ r: 255, g: 255, b: 255 });
  });

  test("grayscale ramp 232-255", () => {
    expect(xterm256ToRgb(232)).toEqual({ r: 8, g: 8, b: 8 });
    expect(xterm256ToRgb(255)).toEqual({ r: 238, g: 238, b: 238 });
  });

  test("out-of-range indexes return black", () => {
    expect(xterm256ToRgb(-1)).toEqual({ r: 0, g: 0, b: 0 });
    expect(xterm256ToRgb(999)).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe("formatTruecolorSgr", () => {
  test("foreground uses 38;2", () => {
    expect(formatTruecolorSgr(38, { r: 80, g: 40, b: 20 })).toBe(
      "\x1b[38;2;80;40;20m",
    );
  });

  test("background uses 48;2", () => {
    expect(formatTruecolorSgr(48, { r: 0, g: 0, b: 0 })).toBe(
      "\x1b[48;2;0;0;0m",
    );
  });
});

describe("dimFrame", () => {
  const factor = 0.5;
  const defaultBg = { r: 32, g: 32, b: 32 };

  test("dims truecolor foreground", () => {
    const input = "\x1b[38;2;200;100;50mhello\x1b[0m";
    const out = dimFrame(input, factor, defaultBg);
    expect(out).toContain("\x1b[38;2;100;50;25m");
    expect(out).toContain("hello");
  });

  test("dims truecolor background", () => {
    const input = "\x1b[48;2;100;200;50mtext\x1b[0m";
    const out = dimFrame(input, factor, defaultBg);
    expect(out).toContain("\x1b[48;2;50;100;25m");
  });

  test("dims combined fg + bg + bold in one SGR", () => {
    const input = "\x1b[1;38;2;100;100;100;48;2;200;200;200mx\x1b[0m";
    const out = dimFrame(input, factor, defaultBg);
    // bold (1) preserved, both colors scaled
    expect(out).toContain("\x1b[1;38;2;50;50;50;48;2;100;100;100m");
  });

  test("converts 256-color foreground to dimmed truecolor", () => {
    // index 196 in cube = (5,0,0) = (255, 0, 0)
    const input = "\x1b[38;5;196mred\x1b[0m";
    const out = dimFrame(input, factor, defaultBg);
    expect(out).toContain("\x1b[38;2;128;0;0m");
  });

  test("preserves non-color SGR codes (reset, bold)", () => {
    const input = "\x1b[1mbold\x1b[0m";
    const out = dimFrame(input, factor, defaultBg);
    expect(out).toContain("\x1b[1m");
    expect(out).toContain("\x1b[0m");
  });

  test("blank lines pass through unchanged", () => {
    const input = "line1\n\nline3";
    const out = dimFrame(input, factor, defaultBg);
    const parts = out.split("\n");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe("");
  });

  test("non-blank lines get default-bg prefix and reset suffix", () => {
    const input = "hello";
    const out = dimFrame(input, factor, defaultBg);
    expect(out.startsWith("\x1b[48;2;32;32;32m")).toBe(true);
    expect(out.endsWith("\x1b[0m")).toBe(true);
  });
});

describe("dimIncrementalChunk", () => {
  const factor = 0.5;
  const defaultBg = { r: 32, g: 32, b: 32 };
  // Helper to build a chunk that mimics Ink's incremental output:
  //   <cursorUp(N)> <row 0> <row 1> ... <row N-1>
  // Each rewrite row is `\x1b[1G<line>\x1b[K\n`. Skipped rows are `\x1b[E`.
  const cursorUp = (n: number) => `\x1b[${n}A`;
  const rewriteRow = (line: string) => `\x1b[1G${line}\x1b[K\n`;
  const skipRow = "\x1b[E";

  test("returns null when no cursorUp anchor present", () => {
    const out = dimIncrementalChunk("hello", factor, defaultBg, {
      top: 0,
      height: 0,
    });
    expect(out).toBeNull();
  });

  test("dims rewritten background row outside protected range", () => {
    const chunk =
      cursorUp(3) +
      rewriteRow("\x1b[38;2;200;100;50mbg-row\x1b[0m") +
      skipRow +
      skipRow;
    const out = dimIncrementalChunk(chunk, factor, defaultBg, {
      top: 5,
      height: 3,
    });
    // row 0 is outside [5, 8) → dimmed (200→100, 100→50, 50→25)
    expect(out).toContain("\x1b[38;2;100;50;25m");
    // default-bg prefix injected
    expect(out).toContain("\x1b[48;2;32;32;32m");
  });

  test("does NOT dim rewritten row inside protected range", () => {
    const protectedLine = "\x1b[38;2;200;100;50mmodal-row\x1b[0m";
    const chunk = cursorUp(3) + skipRow + rewriteRow(protectedLine) + skipRow;
    const out = dimIncrementalChunk(chunk, factor, defaultBg, {
      top: 1,
      height: 1,
    });
    // row 1 is inside [1, 2) → unchanged (original color preserved)
    expect(out).toContain("\x1b[38;2;200;100;50m");
    // no default-bg prefix on the protected row
    // (other rows have skipRow, no content)
    expect(out).not.toContain("\x1b[48;2;32;32;32m");
  });

  test("preserves cursorNextLine units verbatim", () => {
    const chunk = cursorUp(3) + skipRow + skipRow + skipRow;
    const out = dimIncrementalChunk(chunk, factor, defaultBg, {
      top: 0,
      height: 0,
    });
    expect(out).toBe(chunk);
  });

  test("mixes protected and unprotected rows correctly", () => {
    // 5-row frame: rows 0,1 background; rows 2,3 modal; row 4 background
    const chunk =
      cursorUp(5) +
      rewriteRow("bg0") +
      rewriteRow("bg1") +
      rewriteRow("modal2") +
      rewriteRow("modal3") +
      rewriteRow("bg4");
    const out = dimIncrementalChunk(chunk, factor, defaultBg, {
      top: 2,
      height: 2,
    })!;
    // bg rows wrapped with default-bg + reset
    const bgPrefix = "\x1b[48;2;32;32;32m";
    // bg0 dimmed → has prefix
    expect(out).toContain(`\x1b[1G${bgPrefix}bg0\x1b[0m\x1b[K\n`);
    expect(out).toContain(`\x1b[1G${bgPrefix}bg1\x1b[0m\x1b[K\n`);
    // modal rows unchanged → no prefix
    expect(out).toContain("\x1b[1Gmodal2\x1b[K\n");
    expect(out).toContain("\x1b[1Gmodal3\x1b[K\n");
    // bg4 dimmed → has prefix
    expect(out).toContain(`\x1b[1G${bgPrefix}bg4\x1b[0m\x1b[K\n`);
  });

  test("preserves trailing cursorSuffix data after row loop", () => {
    const suffix = "\x1b[?25h"; // show cursor
    const chunk = cursorUp(2) + rewriteRow("a") + rewriteRow("b") + suffix;
    const out = dimIncrementalChunk(chunk, factor, defaultBg, {
      top: 99,
      height: 0,
    })!;
    expect(out.endsWith(suffix)).toBe(true);
  });
});
