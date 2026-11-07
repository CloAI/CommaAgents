import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ChatComposer } from "./ChatComposer";

const meta = {
  title: "Components/ChatComposer",
  component: ChatComposer,
  args: {
    controls: <span>Strategy and model controls</span>,
    warnings: ["Connection interrupted.", "Strategy unavailable."],
    children: <textarea aria-label="Chat input" />,
  },
} satisfies Meta<typeof ChatComposer>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const PagesAndDismissesWarnings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Connection interrupted.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next warning" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Strategy unavailable.",
    );
    await expect(canvas.getByLabelText("Warning count")).toHaveTextContent(
      "2/2",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous warning" }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Connection interrupted.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss all warnings" }),
    );
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("textbox", { name: "Chat input" }),
    ).toBeVisible();
  },
};
