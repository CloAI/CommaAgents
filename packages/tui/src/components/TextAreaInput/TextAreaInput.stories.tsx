import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TextAreaInput } from "./TextAreaInput";

/**
 * `TextAreaInput` is a controlled multi-line text area with soft-wrapping,
 * an inverse-block cursor, and a vertical scrollbar that appears when
 * content exceeds `height`. Meta+Enter triggers `onSubmit(trimmedValue)`.
 */
const meta: Meta<typeof TextAreaInput> = {
  title: "Components/TextAreaInput",
  component: TextAreaInput,
  args: {
    value: "",
    placeholder: "Type here...",
    width: 60,
    height: 6,
  },
  argTypes: {
    placeholder: { control: "text" },
    width: { control: "number" },
    height: { control: "number" },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

/** Stateful wrapper so the input behaves as a real controlled field. */
function ControlledTextAreaInput(
  args: React.ComponentProps<typeof TextAreaInput>,
) {
  const [value, setValue] = useState(args.value);
  return <TextAreaInput {...args} value={value} onChange={setValue} />;
}

export const Empty: Story = {
  args: {
    placeholder: "Type a message... (\u2325+Enter to submit)",
    onSubmit: (text: string) => {
      // eslint-disable-next-line no-console
      console.log("[TextAreaInput] submit:", text);
    },
  },
  render: (args) => <ControlledTextAreaInput {...args} />,
};

export const PreFilled: Story = {
  args: {
    value: "Some draft text the user has already typed.",
    width: 60,
    height: 6,
  },
  render: (args) => <ControlledTextAreaInput {...args} />,
};

export const ScrollableContent: Story = {
  args: {
    id: "notes-area",
    width: 40,
    height: 5,
    value:
      "Line 1: hello world\n" +
      "Line 2: this is a longer line that will soft-wrap when the column count is small\n" +
      "Line 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\nLine 11\nLine 12",
  },
  render: (args) => <ControlledTextAreaInput {...args} />,
};

export const FullWidth: Story = {
  args: {
    width: "100%",
    height: 12,
    placeholder: "Notes...",
    value: "",
  },
  render: (args) => <ControlledTextAreaInput {...args} />,
};
