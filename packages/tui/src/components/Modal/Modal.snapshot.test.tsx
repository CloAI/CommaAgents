import { describe, expect, it } from "bun:test";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { useRef } from "react";

import { CommandPaletteRender } from "../CommandPalette/CommandPalette";
import type { CommandPaletteTheme } from "../CommandPalette/CommandPalette.theme";
import type { Command } from "../CommandPalette/CommandPalette.types";

import { ModalContentRender } from "./Modal";
import type { ModalTheme } from "./Modal.theme";

/**
 * Snapshot tests for the modal **content frame** (the bordered, padded box
 * that holds the modal body) at a range of sizes and content shapes.
 *
 * These render `ModalContentRender` directly — the real production
 * component without the `position: "absolute"` backdrop layer that
 * `ink-testing-library` cannot flush. That backdrop is purely visual
 * (a dim full-screen fill), so excluding it doesn't reduce coverage of
 * the actual frame layout.
 *
 * Scenarios cover:
 * - **Multiple terminal sizes** (120x30 / 100x28 / 80x24 / 60x20):
 *   verifies the resolved width/height behaves at common breakpoints.
 * - **No title / long title**: confirms the optional title row layout.
 * - **Empty content**: confirms the border still renders cleanly.
 * - **Tall content overflow**: confirms `overflow: "hidden"` clips
 *   children and never pushes the bottom border.
 * - **Sub-page view**: snapshots the `CommandPaletteRender` with an
 *   active sub-page, embedded in a modal frame.
 */

const MODAL_THEME: ModalTheme = {
  backdrop: {
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a1a2e",
  },
  content: {
    flexDirection: "column",
    borderStyle: "single",
    borderColor: "gray",
    paddingX: 2,
    paddingY: 1,
    overflow: "hidden",
    flexShrink: 0,
    backgroundColor: "#000000",
  },
  title: {
    bold: true,
    color: "cyan",
  },
};

const PALETTE_THEME: CommandPaletteTheme = {
  container: { flexDirection: "column", width: "100%", height: "100%" },
  searchWrapper: { flexShrink: 0, marginBottom: 1 },
  item: { flexDirection: "row", paddingX: 1, paddingY: 0 },
  itemSelected: { flexDirection: "row", paddingX: 1, paddingY: 0, backgroundColor: "#303030" },
  label: { bold: false, color: "#00d7d7" },
  labelSelected: { bold: true, color: "#00d7d7" },
  separator: { color: "#666666" },
  description: { color: "#666666" },
  empty: { color: "#666666", dimColor: true },
};

const STUB_COMMANDS: readonly Command[] = [
  { id: "help", label: "Help", description: "Show keyboard shortcuts" },
  { id: "exit", label: "Exit", description: "Quit the application", action: () => {} },
];

/**
 * Mock command-list body — fixed content so snapshots are deterministic
 * across runs. Mirrors what `CommandPalette` puts inside its modal at the
 * home view.
 */
function CommandListMock(): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        width="100%"
        flexShrink={0}
      >
        <Text color="cyan">{"\u203A "}</Text>
        <Text dimColor>Type a command...</Text>
      </Box>
      <Box flexDirection="column" marginTop={1} width="100%" flexGrow={1}>
        <Box flexDirection="row" gap={1}>
          <Text bold color="cyan" inverse>
            list-providers
          </Text>
          <Text dimColor>{"\u2014 Browse configured LLM providers"}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text bold color="cyan">
            exit
          </Text>
          <Text dimColor>{"\u2014 Exit the application"}</Text>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Mock sub-page for `CommandPaletteRender` — a fake `ListProvidersPage`
 * shape (filter input + provider list), all static.
 */
function ProvidersPageMock(): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box
        borderStyle="round"
        borderColor="cyan"
        paddingX={1}
        width="100%"
        flexShrink={0}
      >
        <Text color="cyan">{"\u203A "}</Text>
        <Text dimColor>Filter providers...</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Text bold color="cyan" inverse>OpenAI</Text>
        <Text>Anthropic</Text>
        <Text>Local</Text>
      </Box>
    </Box>
  );
}

/**
 * Thin wrapper so we can pass a stable `containerRef` to `CommandPaletteRender`
 * in tests (the render function requires a `React.RefObject<DOMElement>`).
 */
function PaletteRenderWrapper({
  activePage,
}: {
  readonly activePage: React.ComponentType | null;
}): React.ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  return (
    <CommandPaletteRender
      theme={PALETTE_THEME}
      containerRef={ref}
      query=""
      selectedIndex={0}
      onSelectedIndexChange={() => {}}
      filtered={STUB_COMMANDS}
      activePage={activePage}
      onActivate={() => {}}
    />
  );
}

describe("ModalContentRender — terminal size matrix", () => {
  // Each case mirrors the resolved width/height that `Modal` would compute
  // from a `width="80%"`, `height="80%"` config at the given terminal size.
  // (Modal defaults: round(0.8 * cols) / round(0.8 * rows).)
  const CASES = [
    { label: "120x30", contentWidth: 96, contentHeight: 24 },
    { label: "100x28", contentWidth: 80, contentHeight: 22 },
    { label: "80x24", contentWidth: 64, contentHeight: 19 },
    { label: "60x20", contentWidth: 48, contentHeight: 16 },
  ] as const;

  for (const { label, contentWidth, contentHeight } of CASES) {
    it(`should render the home view at ${label}`, () => {
      const { lastFrame } = render(
        <ModalContentRender
          theme={MODAL_THEME}
          title="Command Palette"
          contentWidth={contentWidth}
          contentHeight={contentHeight}
        >
          <CommandListMock />
        </ModalContentRender>,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  }
});

describe("ModalContentRender — title variations", () => {
  it("should render without a title (no top row, no marginBottom)", () => {
    const { lastFrame } = render(
      <ModalContentRender
        theme={MODAL_THEME}
        contentWidth={64}
        contentHeight={12}
      >
        <Text>body content</Text>
      </ModalContentRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it("should render with a long title that may wrap", () => {
    const { lastFrame } = render(
      <ModalContentRender
        theme={MODAL_THEME}
        title="A Very Long Modal Title That Could Plausibly Wrap Across Lines In A Narrow Frame"
        contentWidth={48}
        contentHeight={14}
      >
        <Text>body content</Text>
      </ModalContentRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe("ModalContentRender — content edge cases", () => {
  it("should render an empty content body within the border", () => {
    const { lastFrame } = render(
      <ModalContentRender
        theme={MODAL_THEME}
        title="Empty"
        contentWidth={40}
        contentHeight={10}
      >
        <Box />
      </ModalContentRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it("should clip tall content at the bottom border (overflow:hidden)", () => {
    // 30 rows of body content stuffed into a 10-row frame. The bottom border
    // must remain visible; rows past the frame must be dropped.
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
    const { lastFrame } = render(
      <ModalContentRender
        theme={MODAL_THEME}
        title="Overflow"
        contentWidth={40}
        contentHeight={10}
      >
        <Box flexDirection="column">
          {lines.map((text) => (
            <Text key={text}>{text}</Text>
          ))}
        </Box>
      </ModalContentRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe("ModalContentRender — sub-page (CommandPaletteRender)", () => {
  it("should render the active sub-page without the home command list", () => {
    const { lastFrame } = render(
      <ModalContentRender
        theme={MODAL_THEME}
        title="Command Palette"
        contentWidth={80}
        contentHeight={22}
      >
        <PaletteRenderWrapper activePage={ProvidersPageMock} />
      </ModalContentRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

