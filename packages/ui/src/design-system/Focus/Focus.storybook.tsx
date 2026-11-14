import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Plus } from "lucide-react";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { Input } from "../Input";
import { TextArea } from "../TextArea";
import { Select } from "../Select";
import { MultiSelect } from "../MultiSelect";
import { Switch } from "../Switch";

function FocusGallery() {
  const [selected, setSelected] = useState("review");
  const [multiple, setMultiple] = useState<readonly string[]>([]);
  const [checked, setChecked] = useState(false);
  const options = [
    { value: "review", label: "Review" },
    { value: "build", label: "Build" },
  ];
  return (
    <section
      aria-label="Control focus gallery"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "1rem",
        maxWidth: "28rem",
      }}
    >
      <p>
        Tab through the controls to compare keyboard focus in either appearance.
      </p>
      <Button>Start keyboard preview</Button>
      <Button>Action button</Button>
      <IconButton label="Add item">
        <Plus />
      </IconButton>
      <Input aria-label="Single line input" placeholder="Single line input" />
      <TextArea aria-label="Multiline input" placeholder="Multiline input" />
      <Select
        label="Strategy"
        placeholder="Choose a strategy"
        value={selected}
        options={options}
        onChange={setSelected}
      />
      <div style={{ width: "100%" }}>
        <MultiSelect
          label="Providers"
          listLabel="Providers"
          emptyLabel="All providers"
          value={multiple}
          options={options}
          onChange={setMultiple}
        />
      </div>
      <Switch
        aria-label="Enable setting"
        checked={checked}
        onCheckedChange={setChecked}
      />
      <Button disabled>Disabled button</Button>
      <Input
        disabled
        aria-label="Disabled input"
        placeholder="Disabled input"
      />
    </section>
  );
}

const meta = {
  title: "Design System/Focus",
  component: FocusGallery,
} satisfies Meta<typeof FocusGallery>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

/** Traverse the gallery with real keyboard navigation and leave the chosen control focused.
 * @param {number} tabCount - Control position after the starting button.
 * @returns {Story["play"]} Keyboard interaction for the selected control.
 */
function keyboardFocus(tabCount: number): Story["play"] {
  return async ({ canvasElement }) => {
    within(canvasElement)
      .getByRole("button", { name: "Start keyboard preview" })
      .focus();
    for (let step = 0; step < tabCount; step++) {
      await userEvent.tab();
    }
    const labels = [
      "Action button",
      "Add item",
      "Single line input",
      "Multiline input",
      "Strategy",
      "Providers",
      "Enable setting",
    ];
    const roles = [
      "button",
      "button",
      "textbox",
      "textbox",
      "combobox",
      "combobox",
      "switch",
    ];
    const target = within(canvasElement).getByRole(roles[tabCount - 1]!, {
      name: labels[tabCount - 1]!,
    });
    await expect(target).toHaveFocus();
    await expect(target.matches(":focus-visible")).toBe(true);
  };
}

export const Overview: Story = {};
export const ButtonFocus: Story = { play: keyboardFocus(1) };
export const IconButtonFocus: Story = { play: keyboardFocus(2) };
export const InputFocus: Story = { play: keyboardFocus(3) };
export const TextAreaFocus: Story = { play: keyboardFocus(4) };
export const SelectFocus: Story = { play: keyboardFocus(5) };
export const MultiSelectFocus: Story = { play: keyboardFocus(6) };
export const SwitchFocus: Story = { play: keyboardFocus(7) };
export const Light: Story = {
  globals: { appearancePreview: "light", backgrounds: { value: "light" } },
  play: keyboardFocus(1),
};
export const Dark: Story = {
  globals: { appearancePreview: "dark", backgrounds: { value: "dark" } },
  play: keyboardFocus(1),
};
