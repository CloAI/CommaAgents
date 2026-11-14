import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { CreateWorkspaceDialogRender } from "./CreateWorkspaceDialog";

const now = new Date("2026-11-13T12:00:00.000Z");
const meta = {
  title: "Components/CreateWorkspaceDialog",
  component: CreateWorkspaceDialogRender,
  args: {
    name: "Backend",
    cwd: "/repo/backend",
    mode: "copy",
    general: false,
    chats: [
      {
        runId: "running",
        projectId: "source",
        title: "Running review",
        lastActivityAt: now,
        attention: {
          running: true,
          question: false,
          permission: false,
          failed: false,
        },
      },
      {
        runId: "empty",
        projectId: "source",
        title: "No completed response",
        lastActivityAt: now,
        attention: {
          running: true,
          question: false,
          permission: false,
          failed: false,
        },
      },
    ],
    selected: ["running"],
    checkpoints: { running: "checkpoint-1", empty: null },
    confirmed: false,
    requiresConfirmation: true,
    pending: false,
    onName: fn(),
    onCwd: fn(),
    onMode: fn(),
    onToggle: fn(),
    onConfirmed: fn(),
    onClose: fn(),
    onSubmit: fn().mockResolvedValue(undefined),
  },
} satisfies Meta<typeof CreateWorkspaceDialogRender>;
// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;
export const RunningCopy: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("button", { name: "Create workspace" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("checkbox", { name: /No completed response/ }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Running chats will be copied/ }),
    );
    await expect(args.onConfirmed).toHaveBeenCalledWith(true);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
export const GeneralTransfer: Story = {
  args: { general: true, requiresConfirmation: false, mode: "move" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByText(/Archived chats stay in General/),
    ).toBeVisible();
    await expect(canvas.queryByRole("radio")).toBeNull();
  },
};
