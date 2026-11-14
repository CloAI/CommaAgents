import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { ChatPaneRender } from "./ChatPane";
import type { ChatPaneRenderProps } from "./ChatPane";
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

function ColorPreview(props: ChatPaneRenderProps) {
  const [hue, setHue] = useState<number>();
  return <ChatPaneRender {...props} hue={hue} onHueChange={setHue} />;
}

export const ChangesAndResetsThePaneColor: Story = {
  render: (args) => <ColorPreview {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pane = canvas.getByRole("group", { name: "Chat width" });
    const original = getComputedStyle(pane).backgroundColor;
    await userEvent.click(canvas.getByRole("button", { name: "Chat color" }));
    const popout = canvas.getByRole("dialog", { name: "Chat color" });
    await expect(popout.matches(":popover-open")).toBe(true);
    const palette = canvas.getByRole("button", { name: "Chat color" });
    await waitFor(() => {
      const bounds = popout.getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(
        palette.getBoundingClientRect().bottom,
      );
      expect(bounds.width).toBeLessThanOrEqual(18 * 16);
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth - 7);
    });
    const slider = canvas.getByRole("slider", { name: "Chat color hue" });
    fireEvent.change(slider, { target: { value: "0" } });
    await waitFor(() =>
      expect(pane.style.getPropertyValue("--pane-hue")).toBe("0"),
    );
    await expect(pane.style.getPropertyValue("--pane-hue")).toBe("0");
    await expect(getComputedStyle(pane).backgroundColor).not.toBe(original);
    await userEvent.click(
      canvas.getByRole("button", { name: "Reset to theme" }),
    );
    await expect(getComputedStyle(pane).backgroundColor).toBe(original);
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(
      canvas.queryByRole("dialog", { name: "Chat color" }),
    ).not.toBeInTheDocument();
    await userEvent.click(palette);
    await expect(popout).toBeVisible();
    await userEvent.click(canvas.getByRole("heading", { name: "Chat width" }));
    await waitFor(() => expect(popout).not.toBeVisible());
    await expect(palette).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(palette);
    await expect(popout).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(popout).not.toBeVisible());
  },
};

export const DesktopPopOut: Story = {
  args: { hasSiblings: true, onPopOut: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Full screen" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Move to new window" }),
    );
    await expect(args.onPopOut).toHaveBeenCalledOnce();
  },
};

export const DetachedChat: Story = {
  args: { detached: true, canSplit: true, onPopOut: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Split vertical" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "Split horizontal" }),
    ).toBeEnabled();
    await expect(
      canvas.queryByRole("button", { name: "Move to new window" }),
    ).not.toBeInTheDocument();
    await expect(args.onPopOut).not.toHaveBeenCalled();
  },
};
