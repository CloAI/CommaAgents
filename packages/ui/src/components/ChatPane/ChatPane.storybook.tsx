import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ChatPaneRender } from "./ChatPane";
import runStyles from "../../pages/RunPage/RunPage.module.scss";

const meta = {
  title: "Components/ChatPane",
  component: ChatPaneRender,
  parameters: { layout: "fullscreen" },
  args: {
    title: "Chat width",
    active: true,
    maximized: false,
    hasSiblings: false,
    canSplit: true,
    draggable: false,
    onSplit: fn(),
    onToggleMaximize: fn(),
    onClose: fn(),
    onActivate: fn(),
    onDragStart: fn(),
    onDragEnd: fn(),
    children: (
      <div className={runStyles.page}>
        <div className={runStyles.sections} data-testid="scroll-area">
          <div className={runStyles.content} data-testid="messages">
            <p>Chat content</p>
            <div
              data-testid="streamed-content"
              style={{ height: 0, flexShrink: 0 }}
            />
          </div>
        </div>
        <div className={runStyles.composerFrame}>
          <div className={runStyles.composer}>
            <textarea aria-label="Chat input" />
          </div>
        </div>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 1000, height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatPaneRender>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const TogglesChatWidth: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = canvas.getByTestId("messages");
    const scrollArea = canvas.getByTestId("scroll-area");
    const input = canvas.getByRole("textbox", { name: "Chat input" });
    const initialBounds = body.getBoundingClientRect();
    const composerBounds = input.parentElement!.getBoundingClientRect();
    await expect(scrollArea.scrollHeight).toBeLessThanOrEqual(
      scrollArea.clientHeight,
    );
    await expect(initialBounds.left).toBe(composerBounds.left);
    await expect(initialBounds.right).toBe(composerBounds.right);
    canvas.getByTestId("streamed-content").style.height = "800px";
    await waitFor(() =>
      expect(scrollArea.scrollHeight).toBeGreaterThan(scrollArea.clientHeight),
    );
    await expect(body.getBoundingClientRect().left).toBe(initialBounds.left);
    await expect(body.getBoundingClientRect().right).toBe(initialBounds.right);
    const fullWidth = body.getBoundingClientRect().width;
    const scrollRight = scrollArea.getBoundingClientRect().right;
    const inputWidth = input.getBoundingClientRect().width;
    const pane = canvas.getByRole("group", { name: "Chat width" });
    const gutter = (scrollArea.offsetWidth - scrollArea.clientWidth) / 2;
    const scrollbarCenter =
      scrollArea.getBoundingClientRect().right - gutter / 2;
    await expect(scrollbarCenter - initialBounds.right).toBeCloseTo(
      pane.getBoundingClientRect().right - scrollbarCenter,
      0,
    );
    const toggle = canvas.getByRole("button", { name: "Center chat" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(body.getBoundingClientRect().width).toBe(fullWidth);

    await userEvent.click(toggle);
    await expect(toggle).toHaveAccessibleName("Use full chat width");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const centered = body.getBoundingClientRect();
    const frame = pane.getBoundingClientRect();
    await expect(centered.width).toBeLessThan(frame.width);
    await expect(centered.left - frame.left).toBeCloseTo(
      frame.right - centered.right,
      0,
    );

    const composer = input.parentElement!.getBoundingClientRect();
    await expect(composer.left - frame.left).toBeCloseTo(
      frame.right - composer.right,
      0,
    );
    await expect(centered.left + centered.width / 2).toBeCloseTo(
      composer.left + composer.width / 2,
      0,
    );
    await expect(getComputedStyle(scrollArea).scrollbarGutter).toBe(
      "stable both-edges",
    );
    await expect(scrollArea.getBoundingClientRect().right).toBe(scrollRight);
    await expect(centered.width).toBe(
      52 * parseFloat(getComputedStyle(document.documentElement).fontSize),
    );
    await expect(input.parentElement!.getBoundingClientRect().width).toBe(
      centered.width,
    );
    await expect(input.getBoundingClientRect().width).toBeLessThan(inputWidth);
    await expect(scrollArea.scrollHeight).toBeGreaterThan(
      scrollArea.clientHeight,
    );

    // The centered maximum must not force a narrow split pane to overflow.
    const container = pane.parentElement!;
    container.style.width = "320px";
    await expect(body.getBoundingClientRect().width).toBeLessThanOrEqual(320);
    await expect(body.getBoundingClientRect().width).toBe(
      input.parentElement!.getBoundingClientRect().width,
    );
    container.style.width = "1000px";

    // Native keyboard activation returns to full width without losing content.
    await userEvent.keyboard(" ");
    await expect(toggle).toHaveAccessibleName("Center chat");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(body.getBoundingClientRect().width).toBe(fullWidth);
    await expect(body).toHaveTextContent("Chat content");
    canvas.getByTestId("streamed-content").style.height = "0px";
    await waitFor(() =>
      expect(scrollArea.scrollHeight).toBeLessThanOrEqual(
        scrollArea.clientHeight,
      ),
    );
    await expect(body.getBoundingClientRect().left).toBe(initialBounds.left);
    await expect(body.getBoundingClientRect().right).toBe(initialBounds.right);
  },
};
