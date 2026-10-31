import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../Button";
import { Input } from "../Input";
import { Modal } from "./Modal";

const meta = {
  title: "Design System/Modal",
  component: Modal,
  args: {
    open: false,
    title: "Example dialog",
    onClose: () => {},
    children: "Dialog content",
  },
  parameters: {
    docs: {
      description: {
        component:
          "Controlled modal with a visible title, native focus containment, background scroll lock, and focus restoration. Escape and the close action request dismissal; backdrop clicks leave it open. Compose application-specific navigation and actions in its children.",
      },
    },
  },
  render: function Example(args) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Modal {...args} open={open} onClose={() => setOpen(false)} />
      </>
    );
  },
} satisfies Meta<typeof Modal>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <label>
        Example field
        <Input aria-label="Example field" />
      </label>
    ),
  },
};
export const DismissalAndFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Open dialog" });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole("dialog", { name: "Example dialog" });
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    await expect(close).toHaveFocus();
    await userEvent.click(dialog);
    await expect(dialog).toBeVisible();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    await waitFor(() =>
      expect(canvas.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole("button", { name: "Close dialog" }));
    await waitFor(() =>
      expect(canvas.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(trigger).toHaveFocus();
  },
};
export const KeyboardContainment: Story = {
  args: Default.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    const dialog = canvas.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close dialog" });
    const input = within(dialog).getByRole("textbox", {
      name: "Example field",
    });
    await userEvent.tab();
    await expect(input).toHaveFocus();
    canvas.getByRole("button", { name: "Open dialog" }).focus();
    await expect(input).toHaveFocus();
    close.focus();
    await expect(close).toHaveFocus();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
  },
};
export const LongContent: Story = {
  args: {
    children: Array.from({ length: 40 }, (_, index) => (
      <p key={index}>Scrollable dialog content {index + 1}</p>
    )),
  },
};
