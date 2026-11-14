import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { Slider } from "./Slider";
import type { SliderProps } from "./Slider";

/**
 * Preview a slider with a caller-owned value.
 * @param {SliderProps} props - Starting value and slider options.
 * @returns {React.ReactElement} An interactive slider preview.
 */
function Controlled({
  value: initialValue,
  min,
  max,
  step,
  disabled,
  onValueChange,
}: SliderProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <div style={{ width: 240, display: "flex", alignItems: "center", gap: 12 }}>
      <Slider
        aria-label="Window opacity"
        aria-valuetext={`${value}%`}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          onValueChange(nextValue);
        }}
      />
      <output style={{ minWidth: "4ch", fontVariantNumeric: "tabular-nums" }}>
        {value}%
      </output>
    </div>
  );
}

const meta = {
  title: "Design System/Slider",
  component: Slider,
  args: { value: 60, min: 15, max: 100, step: 1, onValueChange: fn() },
  render: (args) => (
    <Controlled
      value={args.value}
      min={args.min}
      max={args.max}
      step={args.step}
      disabled={args.disabled}
      onValueChange={args.onValueChange}
    />
  ),
  parameters: {
    docs: {
      description: {
        component:
          "A controlled numeric range with a theme-colored track and thumb. Supply value and onValueChange, plus an accessible name through aria-label, aria-labelledby, or a label linked by id. Native keyboard controls support arrows, Home, End, and Page Up/Down. Bounds default to 0–100 with a step of 1.",
      },
    },
  },
} satisfies Meta<typeof Slider>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Minimum: Story = { args: { value: 15 } };
export const Maximum: Story = { args: { value: 100 } };
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const slider = within(canvasElement).getByRole("slider", {
      name: "Window opacity",
    });
    await expect(slider).toBeDisabled();
    await userEvent.click(slider);
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};
export const Changes: Story = {
  args: { value: 60, step: 5 },
  play: async ({ canvasElement, args }) => {
    const slider = within(canvasElement).getByRole("slider", {
      name: "Window opacity",
    });
    fireEvent.input(slider, { target: { value: "65" } });
    await expect(slider).toHaveValue("65");
    await expect(args.onValueChange).toHaveBeenLastCalledWith(65);
    fireEvent.input(slider, { target: { value: "15" } });
    await expect(slider).toHaveValue("15");
    await expect(slider).toHaveAttribute("aria-valuetext", "15%");
    fireEvent.input(slider, { target: { value: "100" } });
    await expect(slider).toHaveValue("100");
  },
};
