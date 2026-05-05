import type { Meta, StoryObj } from "@storybook/react-vite";
import { UserMessage } from "./UserMessage";

/**
 * `UserMessage` renders a single user-typed message inside a bordered
 * panel. The header label defaults to "you" and is configurable via
 * `label`.
 */
const meta: Meta<typeof UserMessage> = {
  title: "Components/MessageList/UserMessage",
  component: UserMessage,
  args: {
    text: "Refactor MessageList so each segment kind has its own renderer.",
  },
  argTypes: {
    text: { control: "text" },
    label: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ShortMessage: Story = {
  args: { text: "yes" },
};

export const LongMessage: Story = {
  args: {
    text: "Could you please walk me through the data flow from the daemon WebSocket message all the way to the rendered AgentMessage segment, including the buffering and flush logic in between? I'd like to understand the failure modes when the daemon disconnects mid-stream.",
  },
};

export const CustomLabel: Story = {
  args: {
    label: "alice",
    text: "Reviewing the diff now.",
  },
};

export const MultilineInput: Story = {
  args: {
    text: "Here is what I want:\n- step one\n- step two\n- step three\n\nThanks!",
  },
};
