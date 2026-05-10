import { describe, expect, it } from "bun:test";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { useRef } from "react";

import { CommandPaletteRender } from "../CommandPalette/CommandPalette";
import type { CommandPaletteTheme } from "../CommandPalette/CommandPalette.theme";
import type { Command } from "../CommandPalette/CommandPalette.types";

import { ModalRender } from "./Modal";

/**
 * Snapshot tests for the modal content box (the bordered, padded box that
 * holds the modal body) at a range of content shapes.
 *
 * These render `ModalRender` directly — the real production component. The
 * backdrop dimming is now handled externally by `AlphaDim`, so these tests
 * only cover the content frame itself.
 *
 * Scenarios cover:
 * - **No title / with title**: confirms the optional title row layout.
 * - **Empty content**: confirms the border still renders cleanly.
 * - **Sub-page view**: snapshots the `CommandPaletteRender` with an
 *   active sub-page, embedded in a modal frame.
 */

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
function ProvidersPageMock(_props: { readonly focusId: string }): React.ReactElement {
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
  readonly activePage: React.ComponentType<{ focusId: string }> | null;
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
      subPageFocusId="test-subpage"
      onActivate={() => {}}
    />
  );
}

describe("ModalRender — title variations", () => {
  it("should render without a title", () => {
    const { lastFrame } = render(
      <ModalRender>
        <Text>body content</Text>
      </ModalRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it("should render with a title", () => {
    const { lastFrame } = render(
      <ModalRender title="Command Palette">
        <CommandListMock />
      </ModalRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it("should render with a long title", () => {
    const { lastFrame } = render(
      <ModalRender title="A Very Long Modal Title That Could Plausibly Wrap Across Lines In A Narrow Frame">
        <Text>body content</Text>
      </ModalRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe("ModalRender — content edge cases", () => {
  it("should render an empty content body within the border", () => {
    const { lastFrame } = render(
      <ModalRender title="Empty">
        <Box />
      </ModalRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe("ModalRender — sub-page (CommandPaletteRender)", () => {
  it("should render the active sub-page without the home command list", () => {
    const { lastFrame } = render(
      <ModalRender title="Command Palette">
        <PaletteRenderWrapper activePage={ProvidersPageMock} />
      </ModalRender>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
