import { describe, expect, it } from "bun:test";
import { Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
import type { TabDefinition } from "./Frame";
import { FrameRender } from "./Frame";
import type { FrameTheme } from "./Frame.theme";

const TEST_THEME: FrameTheme = {
  root: { flexDirection: "column", backgroundColor: "black" },
  tabBar: { flexDirection: "row", gap: 2, paddingX: 1, marginBottom: 0 },
  activeTab: { bold: true, color: "cyan", underline: true },
  inactiveTab: { dimColor: true },
  hoveredTab: { color: "cyan", bold: true },
  tabHint: { dimColor: true },
  content: { flexDirection: "column", flexGrow: 1 },
  footer: { flexDirection: "column" },
};

const TEST_TABS: readonly TabDefinition[] = [
  { path: "/chat", label: "Chat", shortcut: "Alt+1" },
  { path: "/settings", label: "Settings", shortcut: "Alt+2" },
  { path: "/logs", label: "Logs", shortcut: "Alt+3" },
];

describe("FrameRender", () => {
  describe("tab rendering", () => {
    it("should render all tab labels", () => {
      const { lastFrame } = render(
        <FrameRender
          theme={TEST_THEME}
          tabs={TEST_TABS}
          activeTabPath="/chat"
          terminalHeight={24}
          terminalWidth={80}
          onTabSelect={() => {}}
        >
          <Text>Chat content</Text>
        </FrameRender>,
      );

      expect(lastFrame()).toContain("Chat");
      expect(lastFrame()).toContain("Settings");
      expect(lastFrame()).toContain("Logs");
    });

    it("should render children (the active page content)", () => {
      const { lastFrame } = render(
        <FrameRender
          theme={TEST_THEME}
          tabs={TEST_TABS}
          activeTabPath="/chat"
          terminalHeight={24}
          terminalWidth={80}
          onTabSelect={() => {}}
        >
          <Text>Chat content</Text>
        </FrameRender>,
      );

      expect(lastFrame()).toContain("Chat content");
      expect(lastFrame()).toMatchSnapshot();
    });

    it("should mark the active tab path as active", () => {
      const { lastFrame } = render(
        <FrameRender
          theme={TEST_THEME}
          tabs={TEST_TABS}
          activeTabPath="/settings"
          terminalHeight={24}
          terminalWidth={80}
          onTabSelect={() => {}}
        >
          <Text>Settings content</Text>
        </FrameRender>,
      );

      // Both the tab bar and the children are rendered — content is caller's
      // responsibility.
      expect(lastFrame()).toContain("Settings");
      expect(lastFrame()).toContain("Settings content");
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe("footer", () => {
    it("should render footer content when provided", () => {
      const { lastFrame } = render(
        <FrameRender
          theme={TEST_THEME}
          tabs={TEST_TABS}
          activeTabPath="/chat"
          terminalHeight={24}
          terminalWidth={80}
          onTabSelect={() => {}}
          footer={<Text>Status: Ready</Text>}
        >
          <Text>Chat content</Text>
        </FrameRender>,
      );

      expect(lastFrame()).toContain("Status: Ready");
      expect(lastFrame()).toMatchSnapshot();
    });

    it("should not render footer when not provided", () => {
      const { lastFrame } = render(
        <FrameRender
          theme={TEST_THEME}
          tabs={TEST_TABS}
          activeTabPath="/chat"
          terminalHeight={24}
          terminalWidth={80}
          onTabSelect={() => {}}
        >
          <Text>Chat content</Text>
        </FrameRender>,
      );

      expect(lastFrame()).not.toContain("Status:");
    });
  });

  describe("separator", () => {
    it("should render without crashing", () => {
      const { lastFrame } = render(
        <FrameRender
          theme={TEST_THEME}
          tabs={TEST_TABS}
          activeTabPath="/chat"
          terminalHeight={24}
          terminalWidth={80}
          onTabSelect={() => {}}
        >
          <Text>Content</Text>
        </FrameRender>,
      );

      expect(lastFrame()).toBeDefined();
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
