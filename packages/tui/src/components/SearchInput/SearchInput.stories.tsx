import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { SearchInput } from "./SearchInput";

/**
 * `SearchInput` is a controlled single-line search field with a prompt
 * caret and placeholder. It deliberately ignores arrow keys, Enter, and
 * Escape so the parent can own list navigation and dismissal.
 */
const meta: Meta<typeof SearchInput> = {
  title: "Components/SearchInput",
  component: SearchInput,
  args: {
    value: "",
    placeholder: "Search strategies...",
    prompt: "› ",
  },
  argTypes: {
    placeholder: { control: "text" },
    prompt: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Stateful wrapper so the input behaves as a real controlled field. */
function ControlledSearchInput(args: React.ComponentProps<typeof SearchInput>) {
  const [value, setValue] = useState(args.value);
  return <SearchInput {...args} value={value} onChange={setValue} />;
}

export const Empty: Story = {
  render: (args) => <ControlledSearchInput {...args} />,
};

export const WithQuery: Story = {
  args: { value: "research" },
  render: (args) => <ControlledSearchInput {...args} />,
};

export const CustomPrompt: Story = {
  args: { value: "", placeholder: "Search...", prompt: "🔍 " },
  render: (args) => <ControlledSearchInput {...args} />,
};

export const WithFocusId: Story = {
  args: {
    id: "strategy-search",
    value: "agent",
    placeholder: "Search strategies...",
  },
  render: (args) => <ControlledSearchInput {...args} />,
};
