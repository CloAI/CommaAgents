import { describe, expect, it } from "bun:test";
import { render } from "ink-testing-library";
import { OutputModalRender } from "./OutputModal";
import { OUTPUT_MODAL_EMPTY_LINE } from "./OutputModal.constants";
import type { OutputModalTheme } from "./OutputModal.theme";
import type { OutputModalLine, OutputModalQuery } from "./OutputModal.types";
import { compileQuery, filterAndHighlight } from "./OutputModal.utils";

/**
 * Stub theme avoiding colour escapes so frame assertions match raw
 * glyphs. Mirrors the literal-type discipline used by `MarkdownView.test`.
 */
const TEST_THEME: OutputModalTheme = {
  body: { flexDirection: "column", width: "100%" },
  searchRow: { flexDirection: "row" },
  statusRow: { flexDirection: "row", marginBottom: 0 },
  searchStatus: { color: "", dimColor: false },
  searchStatusError: { color: "" },
  lineList: { flexDirection: "column", flexGrow: 1 },
  lineRow: { flexDirection: "row" },
  lineNumber: { color: "", dimColor: false },
  lineText: { color: "" },
  lineMatch: { color: "", backgroundColor: "", bold: true },
  emptyState: { color: "", dimColor: false, italic: true },
};

/** Helper: render the pure component with a body + raw query string. */
function renderModal(body: string, queryRaw: string): string {
  const query: OutputModalQuery = compileQuery(queryRaw);
  const lines: readonly OutputModalLine[] = filterAndHighlight(
    body,
    query.regex,
  );
  const { lastFrame } = render(
    <OutputModalRender
      theme={TEST_THEME}
      query={query}
      lines={lines}
      onQueryChange={() => {}}
    />,
  );
  return lastFrame() ?? "";
}

describe("OutputModalRender", () => {
  describe("empty query", () => {
    it("shows every line with the line-count status", () => {
      const frame = renderModal("alpha\nbeta\ngamma", "");
      expect(frame).toContain("alpha");
      expect(frame).toContain("beta");
      expect(frame).toContain("gamma");
      expect(frame).toContain("3 lines");
    });

    it("preserves trailing empty lines from the source body", () => {
      // `"a\n\n".split("\n")` → ["a", "", ""], so the modal renders
      // three rows (lines 1..3) — the trailing blanks are intentional
      // to mirror what the user sees in tool dumps.
      const frame = renderModal("a\n\n", "");
      expect(frame).toContain("3 lines");
    });
  });

  describe("with regex matches", () => {
    it("filters out non-matching lines and shows the match count", () => {
      const frame = renderModal(
        "first\nsecond match\nthird\nanother match",
        "match",
      );
      // Non-matching lines are excluded.
      expect(frame).not.toContain("first");
      expect(frame).not.toContain("third");
      // Matching lines are kept.
      expect(frame).toContain("second match");
      expect(frame).toContain("another match");
      // 2 matches in 2 lines.
      expect(frame).toContain("2 matches in 2 lines");
    });

    it("is case-insensitive by default", () => {
      const frame = renderModal("HELLO\nworld", "hello");
      expect(frame).toContain("HELLO");
      expect(frame).not.toContain("world");
    });
  });

  describe("no matches", () => {
    it("shows the empty-state row when nothing matches", () => {
      const frame = renderModal("alpha\nbeta", "ZZZ");
      expect(frame).toContain(OUTPUT_MODAL_EMPTY_LINE);
      expect(frame).toContain("no matches");
      expect(frame).toContain("0 matches in 0 lines");
    });
  });

  describe("invalid regex", () => {
    it("surfaces the invalid-regex status and shows every line", () => {
      // Unmatched bracket fails RegExp compile → falls back to no
      // filter so the user can keep typing without losing context.
      const frame = renderModal("alpha\nbeta", "[unterminated");
      expect(frame).toContain("invalid regex");
      // No filter applied — both lines visible.
      expect(frame).toContain("alpha");
      expect(frame).toContain("beta");
    });
  });

  describe("snapshots", () => {
    it("empty query — renders all lines verbatim", () => {
      expect(renderModal("alpha\nbeta\ngamma", "")).toMatchSnapshot();
    });

    it("with matches — filters and highlights", () => {
      expect(
        renderModal(
          "first line\nsecond match here\nthird\nanother match",
          "match",
        ),
      ).toMatchSnapshot();
    });

    it("no matches — empty state row", () => {
      expect(renderModal("alpha\nbeta", "ZZZ")).toMatchSnapshot();
    });

    it("invalid regex — error status, no filter", () => {
      expect(renderModal("alpha\nbeta", "[oops")).toMatchSnapshot();
    });
  });
});
