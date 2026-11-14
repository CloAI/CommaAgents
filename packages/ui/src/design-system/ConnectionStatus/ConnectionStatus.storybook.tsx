import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, waitFor, within } from "storybook/test";
import { ConnectionStatus } from "./ConnectionStatus";

const meta = {
  title: "Design System/ConnectionStatus",
  component: ConnectionStatus,
  args: { label: "Daemon", status: "connected" },
  argTypes: {
    status: {
      control: "select",
      options: ["connected", "disconnected", "warning"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Compact half capsule with an 8px health dot. The service name slides out on hover or keyboard focus. Only the top-left corner is rounded; position the flat edges flush with the bottom-right of its container. Warning is a presentation state for future connection-health checks.",
      },
    },
  },
} satisfies Meta<typeof ConnectionStatus>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};
export const Disconnected: Story = { args: { status: "disconnected" } };
export const Warning: Story = { args: { status: "warning" } };
export const KeyboardReveal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const capsule = canvas.getByRole("button", { name: "Daemon: Connected" });
    const width = capsule.getBoundingClientRect().width;
    capsule.focus();
    await expect(capsule).toHaveFocus();
    await waitFor(() =>
      expect(capsule.getBoundingClientRect().width).toBeGreaterThan(width + 20),
    );
    capsule.blur();
    await waitFor(() =>
      expect(capsule.getBoundingClientRect().width).toBeCloseTo(width, 0),
    );
  },
};
