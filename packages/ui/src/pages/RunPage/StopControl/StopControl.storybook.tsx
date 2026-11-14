import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  expect,
  fireEvent,
  fn,
  userEvent,
  waitFor,
  within,
} from "storybook/test";
import { Modal } from "../../../design-system/Modal";
import { ChatPaneContext } from "../../../hooks/useChatPane";
import { AppProviders, prepareStory } from "../../../test.utils";
import { StopControlRender } from "./StopControl";

const meta = {
  title: "Pages/RunPage/StopControl",
  component: StopControlRender,
  args: { active: true, canStop: true, isStopping: false, onStop: fn() },
  decorators: [
    (Story) => (
      <div
        data-run-page="run-preview"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "4rem 1rem",
        }}
      >
        <input aria-label="Message draft" placeholder="Unsent message" />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StopControlRender>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Stop" }),
    );
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
};
export const HiddenWithoutActiveWork: Story = {
  args: { active: false, canStop: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "Stop" }),
    ).not.toBeInTheDocument();
  },
};
export const Blocked: Story = {
  args: { canStop: false },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Stop" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(args.onStop).not.toHaveBeenCalled();
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};
export const Stopping: Story = { args: { canStop: false, isStopping: true } };
export const FirstEscapeHint: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}");
    const hint = canvas.getByRole("status");
    await expect(hint).toHaveTextContent(
      "Press Escape again to stop this chat.",
    );
    await expect(canvas.getByRole("button", { name: "Stop" })).toHaveAttribute(
      "aria-describedby",
      hint.id,
    );
    await expect(canvas.getByRole("textbox")).toHaveFocus();
    await expect(args.onStop).not.toHaveBeenCalled();
  },
};
export const DoubleEscapeStops: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "Keep my draft.");
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(args.onStop).toHaveBeenCalledOnce();
    await expect(canvas.getByRole("textbox")).toHaveValue("Keep my draft.");
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};
export const TypingDisarmsTheHint: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}x{Escape}");
    await expect(args.onStop).not.toHaveBeenCalled();
    await expect(canvas.getByRole("status")).toBeVisible();
  },
};
export const PointerDisarmsTheHint: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("textbox"));
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    await expect(args.onStop).not.toHaveBeenCalled();
  },
};
export const RepeatedEscapeDoesNotStop: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.click(input);
    await userEvent.keyboard("{Escape}");
    fireEvent.keyDown(input, { key: "Escape", repeat: true });
    await expect(args.onStop).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
};
export const HintExpires: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}");
    await waitFor(
      () => expect(canvas.queryByRole("status")).not.toBeInTheDocument(),
      { timeout: 2500 },
    );
    await userEvent.keyboard("{Escape}");
    await expect(args.onStop).not.toHaveBeenCalled();
    await expect(canvas.getByRole("status")).toBeVisible();
  },
};
export const BodyFocusFallback: Story = {
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("textbox");
    input.focus();
    input.blur();
    await expect(document.body).toHaveFocus();
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(args.onStop).toHaveBeenCalledOnce();
  },
};
export const OtherRunDoesNotStopThisRun: Story = {
  render: (args) => (
    <>
      <StopControlRender
        active={args.active}
        canStop={args.canStop}
        isStopping={args.isStopping}
        onStop={args.onStop}
      />
      <section data-run-page="other-run">
        <input aria-label="Other run draft" />
      </section>
    </>
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("textbox", { name: "Other run draft" }),
    );
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(args.onStop).not.toHaveBeenCalled();
  },
};
export const DialogOwnsEscape: Story = {
  render: (args) => (
    <>
      <StopControlRender
        active={args.active}
        canStop={args.canStop}
        isStopping={args.isStopping}
        onStop={args.onStop}
      />
      <Modal open title="Another decision" onClose={fn()}>
        <input aria-label="Dialog input" />
      </Modal>
    </>
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("textbox", { name: "Dialog input" }),
    );
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(args.onStop).not.toHaveBeenCalled();
  },
};

const layout = {
  root: {
    type: "split" as const,
    id: "split",
    direction: "row" as const,
    children: [
      { type: "pane" as const, id: "active", path: "/runs/run-preview" },
      { type: "pane" as const, id: "inactive", path: "/runs/other" },
    ],
  },
  activeId: "active",
};
export const ActivePane: Story = {
  beforeEach: () => prepareStory({ layout }),
  render: (args) => (
    <AppProviders>
      <ChatPaneContext.Provider value={{ paneId: "active" }}>
        <StopControlRender
          active={args.active}
          canStop={args.canStop}
          isStopping={args.isStopping}
          onStop={args.onStop}
        />
      </ChatPaneContext.Provider>
    </AppProviders>
  ),
  play: DoubleEscapeStops.play,
};
export const InactivePane: Story = {
  beforeEach: ActivePane.beforeEach,
  render: (args) => (
    <AppProviders>
      <ChatPaneContext.Provider value={{ paneId: "inactive" }}>
        <StopControlRender
          active={args.active}
          canStop={args.canStop}
          isStopping={args.isStopping}
          onStop={args.onStop}
        />
      </ChatPaneContext.Provider>
    </AppProviders>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}{Escape}");
    await expect(args.onStop).not.toHaveBeenCalled();
    await expect(canvas.queryByRole("status")).not.toBeInTheDocument();
  },
};
export const HintFitsNarrowViewport: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "20rem" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("textbox"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      const bounds = canvas.getByRole("status").getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
    });
  },
};
