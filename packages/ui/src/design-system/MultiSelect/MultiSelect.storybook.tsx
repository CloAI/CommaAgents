import { useCallback, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MultiSelect } from "./MultiSelect";
import type { MultiSelectProps } from "./MultiSelect";

/**
 * Hold the selected values while reporting changes to the story.
 * @param {MultiSelectProps} props - Initial selection, choices, and labels.
 * @returns {React.ReactElement} A controlled multi-select.
 */
function ControlledMultiSelect({
  label,
  listLabel,
  emptyLabel,
  options,
  value: initialValue,
  onChange,
}: MultiSelectProps) {
  const [value, setValue] = useState(initialValue);
  const handleChange = useCallback(
    (selected: readonly string[]) => {
      setValue(selected);
      onChange(selected);
    },
    [onChange],
  );
  return (
    <MultiSelect
      label={label}
      listLabel={listLabel}
      emptyLabel={emptyLabel}
      options={options}
      value={value}
      onChange={handleChange}
    />
  );
}

const meta = {
  title: "Design System/MultiSelect",
  component: MultiSelect,
  render: (args) => (
    <ControlledMultiSelect
      label={args.label}
      listLabel={args.listLabel}
      emptyLabel={args.emptyLabel}
      options={args.options}
      value={args.value}
      onChange={args.onChange}
    />
  ),
  args: {
    label: "Choose languages",
    listLabel: "Languages",
    emptyLabel: "All languages",
    options: [
      { value: "typescript", label: "TypeScript", description: "ts" },
      { value: "rust", label: "Rust", description: "rs" },
      { value: "python", label: "Python", description: "py" },
    ],
    value: [],
    onChange: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Searchable multi-select with removable pills inside the field. Search labels, values, and descriptions. Click options or use arrows and Enter to toggle them without closing the list. Escape closes it, and the All option clears the selection.",
      },
    },
  },
} satisfies Meta<typeof MultiSelect>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { value: ["typescript", "rust"] } };
export const Empty: Story = { args: { options: [] } };

export const SearchSelectRemoveAndClear: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Choose languages" });
    await userEvent.click(input);
    await userEvent.type(input, "TS");
    await expect(canvas.getAllByRole("option")).toHaveLength(2);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith(["typescript"]);
    await expect(input).toHaveValue("");
    await expect(input).toHaveFocus();
    await userEvent.click(canvas.getByRole("option", { name: "Rust rs" }));
    await expect(args.onChange).toHaveBeenLastCalledWith([
      "typescript",
      "rust",
    ]);
    await expect(canvas.getByRole("listbox")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove TypeScript" }),
    );
    await expect(args.onChange).toHaveBeenLastCalledWith(["rust"]);
    await userEvent.type(input, "no match");
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "No languages match.",
    );
    await userEvent.keyboard("{Escape}");
    await expect(input).toHaveFocus();
    await expect(canvas.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}{Enter}");
    await expect(args.onChange).toHaveBeenLastCalledWith([]);
    await expect(
      canvas.queryByRole("group", { name: "Selected languages" }),
    ).not.toBeInTheDocument();
    await userEvent.click(input);
    await userEvent.tab();
    await expect(input).toHaveAttribute("aria-expanded", "false");
  },
};
