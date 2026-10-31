import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextArea } from "./TextArea";

const meta = {
  title: "Design System/TextArea",
  component: TextArea,
  args: {
    id: "message-field",
    "aria-label": "Message",
    placeholder: "Enter your prompt...",
    rows: 2,
  },
  parameters: {
    docs: {
      description: {
        component:
          "Compact multiline text field without a built-in label. Supply an accessible name using aria-label, aria-labelledby, or an external label. Compose submission behavior outside this primitive.",
      },
    },
  },
} satisfies Meta<typeof TextArea>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = {
  args: { defaultValue: "Help me explore a new strategy." },
};
export const Disabled: Story = {
  args: { disabled: true, defaultValue: "A disabled message field" },
};
