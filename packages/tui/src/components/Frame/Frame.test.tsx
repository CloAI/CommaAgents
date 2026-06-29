import { describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { darkTheme } from "../../Theme/themes/dark";
import { Frame, FrameRender } from "./Frame";
import type { FrameTheme } from "./Frame.theme";

const theme: FrameTheme = {
  root: {
    flexDirection: "column",
    backgroundColor: darkTheme.colors.background,
  },
  tabBar: { flexDirection: "row", gap: 1, paddingX: 1, marginBottom: 0 },
  activeTab: {
    bold: true,
    color: darkTheme.colors.primary,
    underline: true,
  },
  inactiveTab: { dimColor: true },
  hoveredTab: { color: darkTheme.colors.primary, bold: true },
  tabHint: { dimColor: true },
  content: { flexDirection: "column", flexGrow: 1 },
  footer: { flexDirection: "column" },
};

describe("Frame", () => {
  it("resolves terminal sizing and renders frame content", () => {
    const { lastFrame, unmount } = render(
      <Frame
        activeTabPath="/chat"
        tabs={[]}
        onTabSelect={() => {}}
        footer={<Text>connected</Text>}
      >
        <Text>conversation</Text>
      </Frame>,
    );

    expect(lastFrame()).toContain("conversation");
    expect(lastFrame()).toContain("connected");
    unmount();
  });

  it("renders active tabs, content, and a pinned footer snapshot", () => {
    const { lastFrame } = render(
      <FrameRender
        theme={theme}
        activeTabPath="/chat"
        tabs={[
          { path: "/chat", label: "Chat", shortcut: "Alt+1" },
          { path: "/logs", label: "Logs", shortcut: "Alt+2" },
        ]}
        terminalWidth={40}
        terminalHeight={8}
        onTabSelect={() => {}}
        footer={<Text>connected</Text>}
      >
        <Text>conversation</Text>
      </FrameRender>,
    );

    expect(lastFrame()).toContain("Chat");
    expect(lastFrame()).toContain("Logs");
    expect(lastFrame()).toMatchSnapshot();
  });
});
