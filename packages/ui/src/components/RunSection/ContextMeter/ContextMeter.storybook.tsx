import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ContextMeter } from "./ContextMeter";

const meta = {
  title: "Components/RunSection/ContextMeter",
  component: ContextMeter,
  args: { usedTokens: 400, contextWindow: 1000 },
} satisfies Meta<typeof ContextMeter>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = {};
export const Zero: Story = { args: { usedTokens: 0 } };
export const Warning: Story = {
  args: { usedTokens: 750 },
  play: async ({ canvasElement }) => {
    const meter = within(canvasElement).getByRole("meter", {
      name: "Context used",
    });
    await expect(meter).toHaveAttribute("aria-valuenow", "75");
    await expect(meter).toHaveAttribute("data-level", "warning");
  },
};
export const Critical: Story = {
  args: { usedTokens: 900 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("meter")).toHaveAttribute(
      "data-level",
      "critical",
    );
  },
};
export const Full: Story = { args: { usedTokens: 1000 } };
export const OverLimit: Story = {
  args: { usedTokens: 1200 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("meter")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  },
};
export const UnknownUsage: Story = {
  args: { usedTokens: undefined },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("meter"),
    ).not.toBeInTheDocument();
  },
};
export const UnknownWindow: Story = {
  ...UnknownUsage,
  args: { contextWindow: undefined },
};
