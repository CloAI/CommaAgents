import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { WorkspaceMenu } from "./WorkspaceMenu";

const meta = {
  title: "Components/Sidebar/Workspace Menu",
  component: WorkspaceMenu,
  args: { projectName: "CommaAgents", onSearchArchive: fn() },
  render: (args) => (
    <div style={{ padding: 24 }}>
      <WorkspaceMenu {...args} />
      <button style={{ marginLeft: 32 }}>Outside menu</button>
    </div>
  ),
} satisfies Meta<typeof WorkspaceMenu>;

// oxlint-disable-next-line import/no-default-export -- Storybook loads component metadata through the default export.
export default meta;
type Story = StoryObj<typeof meta>;

/** Icon trigger, anchored options, and correct project action. */
export const ArchiveOption: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: "Workspace menu: CommaAgents",
    });
    await expect(trigger.querySelector("svg")).not.toBeNull();
    await expect(trigger.textContent).not.toContain("⋯");
    await userEvent.click(trigger);
    const menu = canvas.getByRole("menu", { name: "CommaAgents options" });
    const archive = within(menu).getByRole("menuitem", {
      name: "Search archive",
    });
    await waitFor(() => expect(archive).toHaveFocus());
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      trigger.getBoundingClientRect().bottom,
    );
    await userEvent.click(archive);
    await expect(args.onSearchArchive).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
    await expect(menu).not.toBeVisible();
  },
};

/** Escape and outside clicks dismiss the menu without activating its options. */
export const Dismissal: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", {
      name: "Workspace menu: CommaAgents",
    });
    await userEvent.click(trigger);
    await waitFor(() =>
      expect(
        canvas.getByRole("menuitem", { name: "Search archive" }),
      ).toHaveFocus(),
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "true"),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Outside menu" }));
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
    await expect(args.onSearchArchive).not.toHaveBeenCalled();
  },
};
