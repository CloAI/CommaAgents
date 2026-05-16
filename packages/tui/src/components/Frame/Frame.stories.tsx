import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { useState } from "react";
import type { TabDefinition } from "./Frame";
import { Frame } from "./Frame";

/**
 * `Frame` is the top-level app chrome — a tab bar, separator, content
 * area, and optional pinned footer. It enables SGR mouse mode for the
 * lifetime of the component and floods the background with the theme's
 * root background color so empty cells don't bleed through.
 *
 * `Frame` internally wraps its tree in `MouseProvider`. Storybook's
 * global decorator already provides one, so the inner one is redundant
 * but harmless.
 */
const tabs: readonly TabDefinition[] = [
  { path: "/chat", label: "Chat", shortcut: "Alt+1" },
  { path: "/runs", label: "Runs", shortcut: "Alt+2" },
  { path: "/settings", label: "Settings", shortcut: "Alt+3" },
];

const meta: Meta<typeof Frame> = {
  title: "Components/Frame",
  component: Frame,
};

export default meta;

type Story = StoryObj<typeof meta>;

function FrameHarness({
  activeTabPath: initial,
  showFooter = true,
}: {
  activeTabPath: string;
  showFooter?: boolean;
}) {
  const [activeTabPath, setActiveTabPath] = useState(initial);
  return (
    <Frame
      tabs={tabs}
      activeTabPath={activeTabPath}
      onTabSelect={setActiveTabPath}
      footer={
        showFooter ? (
          <Text dimColor>Connected · ws://localhost:8080</Text>
        ) : undefined
      }
    >
      <Box flexDirection="column" padding={1}>
        <Text bold>Active tab: {activeTabPath}</Text>
        <Text dimColor>Click a tab in the header to switch.</Text>
      </Box>
    </Frame>
  );
}

export const Default: Story = {
  render: () => <FrameHarness activeTabPath="/chat" />,
};

export const RunsActive: Story = {
  render: () => <FrameHarness activeTabPath="/runs" />,
};

export const NoFooter: Story = {
  render: () => <FrameHarness activeTabPath="/chat" showFooter={false} />,
};
