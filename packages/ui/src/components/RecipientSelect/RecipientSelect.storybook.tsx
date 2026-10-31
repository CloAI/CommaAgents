import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { RecipientSelect } from "./RecipientSelect";

const meta = {
  title: "Components/RecipientSelect",
  component: RecipientSelect,
  args: {
    mode: "steer",
    recipients: [
      { id: "m1", name: "planner" },
      { id: "m2", name: "coder" },
    ],
    value: undefined,
    onChange: fn(),
  },
} satisfies Meta<typeof RecipientSelect>;

// oxlint-disable-next-line import/no-default-export -- Storybook loads stories by default export.
export default meta;
type Story = StoryObj<typeof meta>;

export const ChoosesASteeringRecipient: Story = {
  play: async ({ canvasElement, args }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "Steering recipient",
    });
    await userEvent.selectOptions(select, "coder (2)");
    await expect(args.onChange).toHaveBeenCalledWith("m2");
  },
};

export const LabelsReplies: Story = {
  args: { mode: "reply" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("combobox", { name: "Reply recipient" }),
    ).toBeInTheDocument();
  },
};
