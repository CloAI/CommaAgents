import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AccordionRender } from "./Accordion";

const meta = {
  title: "Design System/Accordion",
  component: AccordionRender,
  args: {
    title: "Section title",
    children: (
      <label>
        Draft <input aria-label="Draft" />
      </label>
    ),
    open: false,
    onToggle: fn(),
  },
  render: function Render(props) {
    const [open, setOpen] = useState(props.open);
    return (
      <AccordionRender
        {...props}
        open={open}
        onToggle={() => {
          props.onToggle();
          setOpen((current) => !current);
        }}
      />
    );
  },
} satisfies Meta<typeof AccordionRender>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Section title" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const input = canvas.getByRole("textbox", { name: "Draft" });
    await userEvent.type(input, "Keep my draft");
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(input).not.toBeVisible();
    await userEvent.keyboard(" ");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(input).toHaveValue("Keep my draft");
  },
};
export const Expanded: Story = { args: { open: true } };
