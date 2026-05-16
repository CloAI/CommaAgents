import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";

import { ToolCallViewRender } from "./ToolCallView";
import {
  TOOL_CALL_GLYPH_COMPLETED,
  TOOL_CALL_GLYPH_ERROR,
} from "./ToolCallView.constants";
import type { ToolCallViewTheme } from "./ToolCallView.theme";
import {
  formatArgsPreview,
  formatResultSummary,
  staticGlyphForStatus,
} from "./ToolCallView.utils";

const TEST_THEME: ToolCallViewTheme = {
  container: { flexDirection: "column", marginTop: 1 },
  runningGlyph: { color: "blue" },
  completedGlyph: { color: "green" },
  errorGlyph: { color: "red" },
  toolName: { bold: true, color: "blue" },
  args: { dimColor: true },
  resultSummary: { dimColor: true },
  errorSummary: { color: "red" },
};

describe("ToolCallViewRender", () => {
  describe("running state", () => {
    it("renders the spinner glyph, tool name, and args without a summary", () => {
      const { lastFrame } = render(
        <ToolCallViewRender
          theme={TEST_THEME}
          leadingGlyph={"\u25DC"}
          toolName="read_file"
          argsPreview='{"path":"x"}'
          resultSummary=""
          status="running"
        />,
      );

      const frame = lastFrame() ?? "";
      expect(frame).toContain("\u25DC");
      expect(frame).toContain("read_file");
      expect(frame).toContain('{"path":"x"}');
      expect(frame).not.toContain("\u2192");
    });

    it("omits the args span entirely when argsPreview is empty", () => {
      const { lastFrame } = render(
        <ToolCallViewRender
          theme={TEST_THEME}
          leadingGlyph={"\u25DC"}
          toolName="ping"
          argsPreview=""
          resultSummary=""
          status="running"
        />,
      );

      const frame = lastFrame() ?? "";
      expect(frame).toContain("ping");
      // No double-space between glyph and tool name (would indicate
      // an empty args span was still rendered).
      expect(frame).not.toMatch(/\u25DC\s{2,}ping/);
    });
  });

  describe("completed state", () => {
    it("renders the completed glyph, name, args, and `→ N lines` summary", () => {
      const { lastFrame } = render(
        <ToolCallViewRender
          theme={TEST_THEME}
          leadingGlyph={TOOL_CALL_GLYPH_COMPLETED}
          toolName="read_file"
          argsPreview='{"path":"x"}'
          resultSummary={"\u2192 3 lines"}
          status="completed"
        />,
      );

      const frame = lastFrame() ?? "";
      expect(frame).toContain(TOOL_CALL_GLYPH_COMPLETED);
      expect(frame).toContain("read_file");
      expect(frame).toContain("\u2192 3 lines");
    });
  });

  describe("error state", () => {
    it("renders the error glyph, name, and `→ <error>` summary", () => {
      const { lastFrame } = render(
        <ToolCallViewRender
          theme={TEST_THEME}
          leadingGlyph={TOOL_CALL_GLYPH_ERROR}
          toolName="write_file"
          argsPreview='{"path":"z"}'
          resultSummary={"\u2192 ENOENT: no such file"}
          status="error"
        />,
      );

      const frame = lastFrame() ?? "";
      expect(frame).toContain(TOOL_CALL_GLYPH_ERROR);
      expect(frame).toContain("write_file");
      expect(frame).toContain("\u2192 ENOENT: no such file");
    });
  });
});

describe("formatArgsPreview", () => {
  it("returns empty for whitespace-only input", () => {
    expect(formatArgsPreview("   \n\t  ")).toBe("");
  });

  it("collapses CRLF, LF, and tab runs into single spaces", () => {
    expect(formatArgsPreview("a\r\nb\n\tc   d")).toBe("a b c d");
  });

  it("returns the collapsed string unchanged when shorter than the cap", () => {
    expect(formatArgsPreview("short")).toBe("short");
  });

  it("truncates long input with a typographic ellipsis", () => {
    const long = "x".repeat(500);
    const out = formatArgsPreview(long);
    expect(out.length).toBe(160 + 1); // cap + ellipsis char
    expect(out.endsWith("\u2026")).toBe(true);
  });
});

describe("formatResultSummary", () => {
  it("returns empty for the running status (no result yet)", () => {
    expect(formatResultSummary("running", undefined, undefined)).toBe("");
  });

  it("returns `→ 0 lines` for an empty completed output", () => {
    expect(formatResultSummary("completed", "", undefined)).toBe(
      "\u2192 0 lines",
    );
  });

  it("returns singular `line` for a one-line completed output", () => {
    expect(formatResultSummary("completed", "single", undefined)).toBe(
      "\u2192 1 line",
    );
  });

  it("counts lines via newline count for multi-line output", () => {
    expect(formatResultSummary("completed", "a\nb\nc", undefined)).toBe(
      "\u2192 3 lines",
    );
  });

  it("returns `→ error` placeholder when error message is empty", () => {
    expect(formatResultSummary("error", undefined, "")).toBe("\u2192 error");
    expect(formatResultSummary("error", undefined, undefined)).toBe(
      "\u2192 error",
    );
  });

  it("renders a short error message verbatim", () => {
    expect(formatResultSummary("error", undefined, "ENOENT")).toBe(
      "\u2192 ENOENT",
    );
  });

  it("truncates long error messages with an ellipsis", () => {
    const long = "x".repeat(500);
    const out = formatResultSummary("error", undefined, long);
    expect(out.startsWith("\u2192 ")).toBe(true);
    expect(out.endsWith("\u2026")).toBe(true);
    // "→ " (2 chars including space) + cap (120) + ellipsis (1) = 123
    expect(out.length).toBe(2 + 120 + 1);
  });

  it("collapses internal whitespace in error messages", () => {
    expect(formatResultSummary("error", undefined, "line1\nline2")).toBe(
      "\u2192 line1 line2",
    );
  });
});

describe("staticGlyphForStatus", () => {
  it("returns the check glyph for completed", () => {
    expect(staticGlyphForStatus("completed")).toBe(TOOL_CALL_GLYPH_COMPLETED);
  });

  it("returns the cross glyph for error", () => {
    expect(staticGlyphForStatus("error")).toBe(TOOL_CALL_GLYPH_ERROR);
  });
});
