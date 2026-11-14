import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
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

export const Default: Story = { args: { warnings: [] } };
export const SingleWarning: Story = {
  args: { warnings: ["Connection interrupted. Reconnecting..."] },
};
export const SingleError: Story = {
  args: {
    warnings: [{ message: "Input no longer pending.", severity: "error" }],
  },
};
export const MixedErrorsAndWarnings: Story = {
  args: {
    warnings: [
      {
        message:
          "Strategy unavailable: Talk. Choose another strategy before sending.",
        severity: "warning",
      },
      { message: "Input no longer pending.", severity: "error" },
      "Connection interrupted. Reconnecting...",
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Strategy unavailable: Talk.",
    );
    await expect(canvas.getByRole("alert").parentElement).toHaveAttribute(
      "data-severity",
      "warning",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next warning" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Input no longer pending.",
    );
    await expect(canvas.getByRole("alert").parentElement).toHaveAttribute(
      "data-severity",
      "error",
    );
    await expect(canvas.getByLabelText("Warning count")).toHaveTextContent(
      "2/3",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next warning" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Connection interrupted.",
    );
    await expect(canvas.getByRole("alert").parentElement).toHaveAttribute(
      "data-severity",
      "warning",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next warning" }));
    await expect(canvas.getByLabelText("Warning count")).toHaveTextContent(
      "1/3",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous warning" }),
    );
    await expect(canvas.getByLabelText("Warning count")).toHaveTextContent(
      "3/3",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous warning" }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Input no longer pending.",
    );
  },
};
export const WithoutControls: Story = {
  args: { warnings: [], controls: undefined },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};

function ChangingWarnings() {
  const [warnings, setWarnings] = useState(["Connection interrupted."]);
  return (
    <>
      <button onClick={() => setWarnings(["Strategy unavailable."])}>
        Receive new warning
      </button>
      <ChatComposer warnings={warnings}>
        <textarea aria-label="Chat input" />
      </ChatComposer>
    </>
  );
}

export const NewWarningsReappearAfterDismissal: Story = {
  render: () => <ChangingWarnings />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Dismiss all warnings" }),
    );
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Receive new warning" }),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Strategy unavailable.",
    );
    await expect(
      canvas.queryByRole("button", { name: "Next warning" }),
    ).not.toBeInTheDocument();
  },
};

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
