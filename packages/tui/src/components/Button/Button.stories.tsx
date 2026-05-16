import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text } from "ink";
import { useState } from "react";
import { MouseProvider } from "../MouseProvider";
import { Button } from "./Button";

/**
 * The `Button` requires `<MouseProvider>` higher in the tree for hover and
 * click handling. We wrap each story in it here so individual stories stay
 * focused on the component under inspection.
 */
function WithMouse({ children }: { children: React.ReactNode }) {
  return <MouseProvider>{children}</MouseProvider>;
}

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  args: {
    label: "Confirm",
    variant: "primary",
    disabled: false,
    onPress: () => {},
  },
  argTypes: {
    variant: {
      control: { type: "inline-radio" },
      options: ["primary", "secondary", "danger", "ghost"],
    },
    disabled: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <WithMouse>
        <Story />
      </WithMouse>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {};

export const Danger: Story = { args: { variant: "danger", label: "Delete" } };

export const Ghost: Story = { args: { variant: "ghost", label: "Cancel" } };

export const Disabled: Story = { args: { disabled: true, label: "Locked" } };

/**
 * Three buttons in a row — exercises focus cycling (Tab) and mouse hover
 * across multiple components inside a single Ink tree.
 */
export const Toolbar: Story = {
  render: () => {
    const [last, setLast] = useState("(none)");
    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={1}>
          <Button
            id="confirm"
            label="Confirm"
            variant="primary"
            onPress={() => setLast("Confirm")}
          />
          <Button
            id="discard"
            label="Discard"
            variant="ghost"
            onPress={() => setLast("Discard")}
          />
          <Button
            id="delete"
            label="Delete"
            variant="danger"
            onPress={() => setLast("Delete")}
          />
        </Box>
        <Text dimColor>last pressed: {last}</Text>
      </Box>
    );
  },
};
