import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Switch } from "./Switch";

/**
 * Hold the value a real caller would own.
 * @param {{ initial: boolean; disabled?: boolean }} props - Starting value and availability.
 * @returns {React.ReactElement} A labelled switch.
 */
function Controlled({
  initial,
  disabled = false,
}: {
  readonly initial: boolean;
  readonly disabled?: boolean;
}) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      aria-label="Keep running"
      checked={checked}
      onCheckedChange={setChecked}
      disabled={disabled}
    />
  );
}

const meta = {
  title: "Design System/Switch",
  component: Switch,
  parameters: {
    docs: {
      description: {
        component:
          "An on/off setting that applies at once. Give it an accessible name; its state is announced as a switch.",
      },
    },
  },
} satisfies Meta<typeof Switch>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: { checked: false, onCheckedChange: () => undefined },
  render: () => <Controlled initial={false} />,
};
export const On: Story = {
  args: { checked: true, onCheckedChange: () => undefined },
  render: () => <Controlled initial />,
};
export const Disabled: Story = {
  args: { checked: false, onCheckedChange: () => undefined },
  render: () => <Controlled initial={false} disabled />,
};
export const Toggles: Story = {
  args: { checked: false, onCheckedChange: () => undefined },
  render: () => <Controlled initial={false} />,
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole("switch", {
      name: "Keep running",
    });
    await expect(control).toHaveAttribute("aria-checked", "false");
    await userEvent.click(control);
    await expect(control).toHaveAttribute("aria-checked", "true");
    control.focus();
    await userEvent.keyboard("{Enter}");
    await expect(control).toHaveAttribute("aria-checked", "false");
  },
};
