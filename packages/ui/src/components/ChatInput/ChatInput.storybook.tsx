import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { ChatInput } from "./ChatInput";

const meta = {
  title: "Components/ChatInput",
  component: ChatInput,
  args: { onSubmit: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "Compact prompt composer with an inset up-arrow Send action. Starts at one line, grows to three, then scrolls internally. Enter submits trimmed text; Shift+Enter adds a newline. Sending preserves the draft. Submission is supplied by the caller.",
      },
    },
  },
} satisfies Meta<typeof ChatInput>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Send" }),
    ).toBeDisabled();
  },
};

export const ActionsStayUsableWhileSendingIsDisabled: Story = {
  args: {
    disabled: true,
    actions: <button type="button">Extra</button>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("textbox", { name: "Message" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Extra" })).toBeEnabled();
  },
};
export const SendByButton: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message" });
    const send = canvas.getByRole("button", { name: "Send" });
    const initialBorder = window.getComputedStyle(send).borderColor;
    await userEvent.type(input, "  Explore agents  ");
    await expect(window.getComputedStyle(send).borderColor).toBe(initialBorder);
    await userEvent.click(send);
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith("Explore agents");
    await expect(input).toHaveValue("  Explore agents  ");
  },
};
export const SendByEnter: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Message",
    });
    await userEvent.type(input, "A prompt{Enter}");
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).toHaveBeenCalledWith("A prompt");
    await expect(input).toHaveValue("A prompt");
  },
};
export const Multiline: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Message",
    });
    await userEvent.type(input, "First line{Shift>}{Enter}{/Shift}Second line");
    await expect(input).toHaveValue("First line\nSecond line");
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
export const WhitespaceOnly: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "   {Enter}",
    );
    await expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
export const Composing: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Message",
    });
    await userEvent.type(input, "Composing input");
    await fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      isComposing: true,
    });
    await fireEvent.keyDown(input, {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
    });
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const GrowAndShrink: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Message",
    });
    const singleLineHeight = input.getBoundingClientRect().height;
    const send = within(canvasElement).getByRole("button", { name: "Send" });
    const initialSendRight = send.getBoundingClientRect().right;
    await expect(singleLineHeight).toBeLessThan(48);
    await userEvent.type(input, "First{Shift>}{Enter}{/Shift}Second");
    const twoLineHeight = input.getBoundingClientRect().height;
    await expect(twoLineHeight).toBeGreaterThan(singleLineHeight);
    await userEvent.type(input, "{Shift>}{Enter}{/Shift}Third");
    const threeLineHeight = input.getBoundingClientRect().height;
    await expect(threeLineHeight).toBeGreaterThan(twoLineHeight);
    await userEvent.type(input, "{Shift>}{Enter}{/Shift}Fourth");
    await expect(input.getBoundingClientRect().height).toBeCloseTo(
      threeLineHeight,
      0,
    );
    await expect(input.scrollHeight).toBeGreaterThan(input.clientHeight);
    await expect(send.getBoundingClientRect().right).toBeLessThan(
      initialSendRight,
    );
    await userEvent.clear(input);
    await expect(send.getBoundingClientRect().right).toBeCloseTo(
      initialSendRight,
      0,
    );
    await expect(input.getBoundingClientRect().height).toBeCloseTo(
      singleLineHeight,
      0,
    );
    await expect(window.getComputedStyle(input).overflowY).toBe("hidden");
  },
};

export const PastedOverflow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message" });
    const prompt =
      "First line\nSecond line\nThird line\nFourth line\nFifth line";
    await userEvent.click(input);
    await userEvent.paste(prompt);
    await expect(input).toHaveValue(prompt);
    await expect(input.getBoundingClientRect().height).toBeLessThan(100);
    await expect(input.scrollHeight).toBeGreaterThan(input.clientHeight);
    await expect(window.getComputedStyle(input).overflowY).toBe("auto");
    await expect(window.getComputedStyle(input).resize).toBe("none");
    const send = canvas.getByRole("button", { name: "Send" });
    await expect(
      input.getBoundingClientRect().right -
        Number.parseFloat(window.getComputedStyle(input).paddingRight),
    ).toBeLessThanOrEqual(send.getBoundingClientRect().left);
    await expect(input.getBoundingClientRect().right).toBeGreaterThan(
      send.getBoundingClientRect().right,
    );
    await expect(send.querySelector("svg")).toBeInTheDocument();
    await expect(send).toHaveAttribute("title", "Send");
  },
};

export const WrapOnResize: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message" });
    const composer = input.closest("form")!;
    try {
      composer.style.width = "640px";
      await userEvent.type(
        input,
        "A prompt that wraps when the composer becomes narrow.",
      );
      const wideHeight = input.getBoundingClientRect().height;
      composer.style.width = "240px";
      await waitFor(() =>
        expect(input.getBoundingClientRect().height).toBeGreaterThan(
          wideHeight,
        ),
      );
      composer.style.width = "640px";
      await waitFor(() =>
        expect(input.getBoundingClientRect().height).toBeCloseTo(wideHeight, 0),
      );
    } finally {
      composer.style.width = "";
    }
  },
};

export const ClearsAfterAcknowledgement: Story = {
  args: { clearOnSuccess: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const acknowledgement = Promise.withResolvers<string | undefined>();
    args.onSubmit.mockReturnValueOnce(acknowledgement.promise);
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "A reply{Enter}");
    await expect(input).toHaveValue("A reply");
    await expect(input).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Send" })).toBeDisabled();
    acknowledgement.resolve(undefined);
    await waitFor(() => expect(input).toHaveValue(""));
    await expect(input).toBeEnabled();
  },
};

export const RetainsFailedDraft: Story = {
  args: { clearOnSuccess: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    args.onSubmit.mockResolvedValueOnce("Connection lost.");
    const input = canvas.getByRole("textbox", { name: "Message" });
    await userEvent.type(input, "Keep this message{Enter}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Connection lost.",
    );
    await expect(input).toHaveValue("Keep this message");
    await expect(input).toBeEnabled();
  },
};
export const FocusesWhenAvailable: Story = {
  args: { autoFocus: true },
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole("textbox", { name: "Message" }),
      ).toHaveFocus(),
    );
  },
};
