import type { Meta, StoryObj } from "@storybook/react-vite";
import { Settings } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { IconButton } from "./IconButton";

const meta = {
  title: "Design System/IconButton",
  component: IconButton,
  args: { label: "Settings", children: <Settings />, onClick: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "Compact 28px icon action with a 16px Lucide icon. Supply a descriptive label for its accessible name and native hover title.",
      },
    },
  },
} satisfies Meta<typeof IconButton>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const KeyboardActivation: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", {
      name: "Settings",
    });
    button.focus();
    await expect(button).toHaveFocus();
    await expect(button).toHaveAttribute("title", "Settings");
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
