import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "./Button";

const meta = {
  title: "Design System/Button",
  component: Button,
  args: { children: "Send", disabled: false, type: "button", onClick: fn() },
  argTypes: {
    children: { control: "text" },
    type: { control: "inline-radio", options: ["button", "submit", "reset"] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Primary action. Use a short verb as the label. Native keyboard interaction and disabled behavior are preserved.",
      },
    },
  },
} satisfies Meta<typeof Button>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const KeyboardFocus: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "Send" });
    button.focus();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};
