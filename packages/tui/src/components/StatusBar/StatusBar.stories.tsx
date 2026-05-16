import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ChatStatus } from "../../hooks/useChat/useChat.types";
import { StatusBar } from "./StatusBar";

/**
 * `StatusBar` shows the current chat run status with an optional spinner,
 * strategy name, and error message. The props interface is declared inline
 * in `StatusBar.tsx` and not exported — the props shape is mirrored here.
 */

interface StatusBarStoryArgs {
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly strategyName?: string;
}

const meta: Meta<StatusBarStoryArgs> = {
  title: "Components/StatusBar",
  component: StatusBar,
  args: {
    status: "idle",
    error: null,
    strategyName: "planner-v2",
  },
  argTypes: {
    status: {
      control: "select",
      options: [
        "idle",
        "pending",
        "running",
        "waiting_input",
        "waiting_permission",
        "completed",
        "error",
        "cancelled",
      ] satisfies ChatStatus[],
    },
    error: { control: "text" },
    strategyName: { control: "text" },
  },
};

export default meta;

type Story = StoryObj<StatusBarStoryArgs>;

export const Idle: Story = {
  args: { status: "idle", error: null, strategyName: "planner-v2" },
};

export const Running: Story = {
  args: { status: "running", error: null, strategyName: "planner-v2" },
};

export const WaitingInput: Story = {
  args: { status: "waiting_input", error: null, strategyName: "planner-v2" },
};

export const WaitingPermission: Story = {
  args: {
    status: "waiting_permission",
    error: null,
    strategyName: "planner-v2",
  },
};

export const Completed: Story = {
  args: { status: "completed", error: null, strategyName: "planner-v2" },
};

export const Errored: Story = {
  args: {
    status: "error",
    error: "Connection refused",
    strategyName: "planner-v2",
  },
};

export const NoStrategy: Story = {
  args: { status: "idle", error: null, strategyName: undefined },
};
