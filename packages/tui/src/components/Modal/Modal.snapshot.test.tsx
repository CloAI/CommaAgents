import { describe, expect, it } from "bun:test";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import type React from "react";
import { darkTheme } from "../../Theme";

import { CommandPaletteRender } from "../CommandPalette/CommandPalette";
import type { Command } from "../CommandPalette/CommandPalette.types";

import { ModalRender } from "./Modal";
import { createModalTheme } from "./Modal.theme";

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
 * - **Home view**: snapshots the `CommandPaletteRender` (home command list)
 *   embedded in a modal frame.
 */

const STUB_COMMANDS: readonly Command[] = [
  {
    id: "help",
    label: "Help",
    description: "Show keyboard shortcuts",
    page: () => null,
  },
  {
    id: "exit",
    label: "Exit",
    description: "Quit the application",
    page: () => null,
  },
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

describe("ModalRender — title variations", () => {
  it("should render without a title", () => {
    const { lastFrame } = render(
      <ModalTestFrame>
        <ModalRender theme={createModalTheme(darkTheme)} width={40} height={8}>
          <Text>body content</Text>
        </ModalRender>
      </ModalTestFrame>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it("should render with a title", () => {
    const { lastFrame } = render(
      <ModalTestFrame>
        <ModalRender
          theme={createModalTheme(darkTheme)}
          title="Command Palette"
          width={40}
          height={8}
        >
          <CommandListMock />
        </ModalRender>
      </ModalTestFrame>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it("should render with a long title", () => {
    const { lastFrame } = render(
      <ModalTestFrame>
        <ModalRender
          theme={createModalTheme(darkTheme)}
          title="A Very Long Modal Title That Could Plausibly Wrap Across Lines In A Narrow Frame"
          width={40}
          height={8}
        >
          <Text>body content</Text>
        </ModalRender>
      </ModalTestFrame>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe("ModalRender — content edge cases", () => {
  it("should render an empty content body within the border", () => {
    const { lastFrame } = render(
      <ModalTestFrame>
        <ModalRender
          theme={createModalTheme(darkTheme)}
          title="Empty"
          width={40}
          height={8}
        >
          <Box />
        </ModalRender>
      </ModalTestFrame>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

describe("ModalRender — CommandPaletteRender (home view)", () => {
  it("should render the command palette home view inside a modal", () => {
    const { lastFrame } = render(
      <ModalTestFrame>
        <ModalRender
          theme={createModalTheme(darkTheme)}
          title="Command Palette"
          width={40}
          height={8}
        >
          <CommandPaletteRender
            query=""
            filtered={STUB_COMMANDS}
            onCommandSelected={() => {}}
            isFocused={false}
          />
        </ModalRender>
      </ModalTestFrame>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});

function ModalTestFrame({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box width={40} height={8}>
      {children}
    </Box>
  );
}
