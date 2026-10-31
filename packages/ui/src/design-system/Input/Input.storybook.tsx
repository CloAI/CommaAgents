import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Input } from "./Input";

const meta = {
  title: "Design System/Input",
  component: Input,
  args: { "aria-label": "Daemon URL", placeholder: "ws://127.0.0.1:7422/ws" },
  parameters: {
    docs: {
      description: {
        component:
          "Compact native single-line field. Compose a visible label and validation message in the calling form; native input attributes and refs are supported.",
      },
    },
  },
} satisfies Meta<typeof Input>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = {
  args: { disabled: true, value: "ws://127.0.0.1:7422/ws" },
};
export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "invalid address" },
};
export const Editable: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Daemon URL",
    });
    await userEvent.type(input, "wss://daemon.example/ws");
    await expect(input).toHaveValue("wss://daemon.example/ws");
    await expect(input).toHaveFocus();
  },
};
