import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { exampleProviders } from "../SettingsDialog/ProvidersSettings/test.utils";
import { ModelFilters } from "./ModelFilters";
import type { ModelFiltersProps } from "./ModelFilters";

function ControlledFilters(args: ModelFiltersProps) {
  const [value, setValue] = useState(args.value);
  return (
    <ModelFilters
      {...args}
      value={value}
      onChange={(next) => {
        setValue(next);
        args.onChange(next);
      }}
    />
  );
}

const meta = {
  title: "Components/ModelFilters",
  component: ModelFilters,
  args: {
    providers: exampleProviders,
    value: { search: "", providerIds: [], capabilities: [] },
    onChange: fn(),
  },
  render: (args) => <ControlledFilters {...args} />,
} satisfies Meta<typeof ModelFilters>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = {
  args: {
    value: {
      search: "reasoner",
      providerIds: ["alpha"],
      capabilities: ["reasoning", "tools"],
    },
  },
};
export const SearchAndChoose: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox"), "review");
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by provider" }),
    );
    await userEvent.click(canvas.getByRole("option", { name: /^Alpha/ }));
    await userEvent.keyboard("{Escape}");
    await expect(args.onChange).toHaveBeenLastCalledWith({
      search: "review",
      providerIds: ["alpha"],
      capabilities: [],
    });
    await userEvent.click(canvas.getByRole("button", { name: "Remove Alpha" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({
      search: "review",
      providerIds: [],
      capabilities: [],
    });
  },
};
export const EmptyProviders: Story = { args: { providers: [] } };
export const NoMatchingProvider: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("combobox", { name: "Filter by provider" }),
      "missing-provider",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "No providers match",
    );
  },
};
export const Narrow: Story = {
  ...Selected,
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
