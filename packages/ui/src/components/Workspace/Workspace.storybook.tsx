import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test";
import { LAYOUT_STORAGE_KEY } from "../../hooks/useLayout";
import type { Layout, LayoutNode } from "../../hooks/useLayout";
import { AppProviders, prepareStory } from "../../test.utils";
import { Workspace } from "./Workspace";

const pane = (id: string, path = "/"): LayoutNode => ({
  type: "pane",
  id,
  path,
});
const row = (...children: LayoutNode[]): LayoutNode => ({
  type: "split",
  id: "split",
  direction: "row",
  children,
});

/** Two panes side by side: run aaaaaaaa on the left and run bbbbbbbb on the right. */
const TWO_RUNS: Layout = {
  root: row(pane("a", "/runs/aaaaaaaa"), pane("b", "/runs/bbbbbbbb")),
  activeId: "b",
};

const meta = {
  title: "Screens/Workspace",
  component: Workspace,
  render: () => (
    <AppProviders>
      <Workspace />
    </AppProviders>
  ),
  beforeEach: () => prepareStory(),
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A resizable grid of chat panes. Each pane has its own route and a header with split, full screen, and close actions; drag a header onto an edge of another pane to split beside it. The address bar follows the focused pane.",
      },
    },
  },
} satisfies Meta<typeof Workspace>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Describe a pane's place on screen.
 * @param {HTMLElement} element - The pane.
 * @returns {DOMRect} Its bounding box.
 */
const box = (element: HTMLElement): DOMRect => element.getBoundingClientRect();

/**
 * Find a pane's header, which is the part that starts a drag.
 * @param {HTMLElement} pane - The pane.
 * @returns {HTMLElement} Its header.
 */
const headerOf = (pane: HTMLElement): HTMLElement =>
  within(pane).getByRole("heading").parentElement!;

export const SinglePane: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("group", { name: "New chat" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Split vertical" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "Split horizontal" }),
    ).toBeEnabled();
    // With nothing else to focus or remove, those actions stay hidden.
    await expect(
      canvas.queryByRole("button", { name: "Full screen" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Close pane" }),
    ).toBeNull();
  },
};

export const SplitVerticalPutsANewChatBeside: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Split vertical" }),
    );
    const panes = await waitFor(() => {
      const found = canvas.getAllByRole("group", { name: "New chat" });
      if (found.length !== 2) {
        throw new Error("Not split yet.");
      }
      return found;
    });
    // Allotment lays the new pane out after it mounts.
    await waitFor(() =>
      expect(box(panes[1]!).left).toBeGreaterThanOrEqual(
        box(panes[0]!).right - 1,
      ),
    );
    await expect(
      canvas.getAllByRole("button", { name: "Close pane" }),
    ).toHaveLength(2);
    // The new pane is saved with the layout.
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}").root?.type,
      ).toBe("split"),
    );
  },
};

export const SplitHorizontalPutsANewChatBelow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Split horizontal" }),
    );
    const panes = await waitFor(() => {
      const found = canvas.getAllByRole("group", { name: "New chat" });
      if (found.length !== 2) {
        throw new Error("Not split yet.");
      }
      return found;
    });
    await waitFor(() =>
      expect(box(panes[1]!).top).toBeGreaterThanOrEqual(
        box(panes[0]!).bottom - 1,
      ),
    );
  },
};

export const ClosingAPaneLeavesTheOthers: Story = {
  beforeEach: () => prepareStory({ layout: TWO_RUNS }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = within(canvas.getByRole("group", { name: "Run aaaaaaaa" }));
    await userEvent.click(first.getByRole("button", { name: "Close pane" }));
    await waitFor(() =>
      expect(canvas.queryByRole("group", { name: "Run aaaaaaaa" })).toBeNull(),
    );
    await expect(
      canvas.getByRole("group", { name: "Run bbbbbbbb" }),
    ).toBeVisible();
    // The survivor is alone again, so its extra actions disappear.
    await expect(
      canvas.queryByRole("button", { name: "Close pane" }),
    ).toBeNull();
  },
};

export const FullScreenKeepsOtherPanesMounted: Story = {
  beforeEach: () =>
    prepareStory({
      layout: { root: row(pane("a"), pane("b")), activeId: "a" },
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [first, second] = canvas.getAllByRole("group", { name: "New chat" });
    const draft = within(second!).getByRole("textbox", { name: "Message" });
    await userEvent.type(draft, "unsent thought");
    await userEvent.click(
      within(first!).getByRole("button", { name: "Full screen" }),
    );
    // Allotment collapses a hidden pane to no width instead of removing it.
    await waitFor(() => expect(box(second!).width).toBeLessThan(2));
    await expect(first!).toBeVisible();
    await userEvent.click(
      within(first!).getByRole("button", { name: "Restore" }),
    );
    await waitFor(() => expect(box(second!).width).toBeGreaterThan(100));
    // The hidden pane was never unmounted, so its draft survived.
    await expect(draft).toHaveValue("unsent thought");
  },
};

export const DraggingAHeaderDocksThePane: Story = {
  beforeEach: () => prepareStory({ layout: TWO_RUNS }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const left = canvas.getByRole("group", { name: "Run aaaaaaaa" });
    const right = canvas.getByRole("group", { name: "Run bbbbbbbb" });
    await waitFor(() => {
      expect(box(left).width).toBeGreaterThan(100);
      expect(box(right).height).toBeGreaterThanOrEqual(160);
    });
    const dataTransfer = new DataTransfer();
    fireEvent.dragStart(headerOf(left), { dataTransfer });
    // Dropping on the bottom edge of the other pane stacks the two.
    const overlay = await within(right).findByTestId("drop-zones");
    const target = box(right);
    const point = {
      clientX: target.left + target.width / 2,
      clientY: target.bottom - 4,
      dataTransfer,
    };
    fireEvent.dragOver(overlay, point);
    fireEvent.drop(overlay, point);
    fireEvent.dragEnd(headerOf(left), { dataTransfer });
    await waitFor(() => {
      const moved = canvas.getByRole("group", { name: "Run aaaaaaaa" });
      const other = canvas.getByRole("group", { name: "Run bbbbbbbb" });
      expect(box(moved).width).toBeGreaterThan(100);
      expect(box(moved).height).toBeGreaterThanOrEqual(160);
      expect(box(other).width).toBeGreaterThan(100);
      expect(box(other).height).toBeGreaterThanOrEqual(160);
      if (box(moved).top < box(other).bottom - 1) {
        throw new Error("Not docked yet.");
      }
    });
    await waitFor(() => expect(window.location.hash).toBe("#/runs/aaaaaaaa"));
    await expect(
      box(canvas.getByRole("group", { name: "Run aaaaaaaa" })).left,
    ).toBeCloseTo(
      box(canvas.getByRole("group", { name: "Run bbbbbbbb" })).left,
      0,
    );
  },
};

export const AddressBarFollowsTheFocusedPane: Story = {
  beforeEach: () => prepareStory({ layout: TWO_RUNS }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(window.location.hash).toBe("#/runs/bbbbbbbb"));
    await userEvent.click(canvas.getByRole("group", { name: "Run aaaaaaaa" }));
    await waitFor(() => expect(window.location.hash).toBe("#/runs/aaaaaaaa"));
  },
};

export const OpensTheAddressBarRouteInTheFocusedPane: Story = {
  render: () => (
    <AppProviders initialPath="/runs/cccccccc">
      <Workspace />
    </AppProviders>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("group", { name: "Run cccccccc" }),
    ).toBeVisible();
  },
};

export const SplitsBeyondEightPanes: Story = {
  beforeEach: () =>
    prepareStory({
      layout: {
        root: row(
          ...Array.from({ length: 8 }, (_, index) => pane(`p${index}`)),
        ),
        activeId: "p0",
      },
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getAllByRole("group", { name: "New chat" }),
    ).toHaveLength(8);
    for (const button of canvas.getAllByRole("button", {
      name: "Split vertical",
    })) {
      await expect(button).toBeEnabled();
    }
    await userEvent.click(
      canvas.getAllByRole("button", { name: "Split vertical" })[0]!,
    );
    await expect(
      canvas.getAllByRole("group", { name: "New chat" }),
    ).toHaveLength(9);
  },
};

export const SplitPaneDocksBelowItsOriginalPane: Story = {
  beforeEach: () =>
    prepareStory({
      layout: { root: pane("main", "/runs/aaaaaaaa"), activeId: "main" },
    }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvas.getByRole("group", { name: "Run aaaaaaaa" });
    await userEvent.click(
      within(main).getByRole("button", { name: "Split vertical" }),
    );
    const added = await canvas.findByRole("group", { name: "New chat" });
    await waitFor(() => expect(box(added).width).toBeGreaterThan(100));
    const dataTransfer = new DataTransfer();
    fireEvent.dragStart(headerOf(added), { dataTransfer });
    const original = canvas.getByRole("group", { name: "Run aaaaaaaa" });
    const overlay = await within(original).findByTestId("drop-zones");
    const target = box(original);
    const point = {
      clientX: target.left + target.width / 2,
      clientY: target.bottom - 4,
      dataTransfer,
    };
    fireEvent.dragOver(overlay, point);
    fireEvent.drop(overlay, point);
    fireEvent.dragEnd(headerOf(added), { dataTransfer });
    await waitFor(() => {
      const top = box(canvas.getByRole("group", { name: "Run aaaaaaaa" }));
      const bottom = box(canvas.getByRole("group", { name: "New chat" }));
      expect(top.height).toBeGreaterThanOrEqual(160);
      expect(bottom.height).toBeGreaterThanOrEqual(160);
      expect(top.width).toBeGreaterThan(100);
      expect(bottom.width).toBeGreaterThan(100);
      expect(bottom.top).toBeGreaterThanOrEqual(top.bottom - 1);
      expect(bottom.left).toBeCloseTo(top.left, 0);
    });
    await waitFor(() => expect(window.location.hash).toBe("#/"));
    await expect(
      within(canvas.getByRole("group", { name: "New chat" })).getByRole(
        "textbox",
        { name: "Message" },
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("heading", { name: "Run aaaaaaaa" }),
    );
    await waitFor(() => expect(window.location.hash).toBe("#/runs/aaaaaaaa"));
    await waitFor(() => {
      const saved = JSON.parse(
        localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}",
      );
      expect(saved.root.direction).toBe("column");
      expect(saved.root.children).toHaveLength(2);
      expect(
        saved.root.children.map((child: { path: string }) => child.path),
      ).toEqual(["/runs/aaaaaaaa", "/"]);
    });

    // Dock back onto a side edge to exercise the reverse axis change.
    const lowerPane = canvas.getByRole("group", { name: "New chat" });
    const upperPane = canvas.getByRole("group", { name: "Run aaaaaaaa" });
    const reverseTransfer = new DataTransfer();
    fireEvent.dragStart(headerOf(lowerPane), { dataTransfer: reverseTransfer });
    const reverseOverlay = await within(upperPane).findByTestId("drop-zones");
    const upperBounds = box(upperPane);
    const reversePoint = {
      clientX: upperBounds.right - 4,
      clientY: upperBounds.top + upperBounds.height / 2,
      dataTransfer: reverseTransfer,
    };
    fireEvent.dragOver(reverseOverlay, reversePoint);
    fireEvent.drop(reverseOverlay, reversePoint);
    fireEvent.dragEnd(headerOf(lowerPane), { dataTransfer: reverseTransfer });
    await waitFor(() => {
      const originalBounds = box(
        canvas.getByRole("group", { name: "Run aaaaaaaa" }),
      );
      const movedBounds = box(canvas.getByRole("group", { name: "New chat" }));
      expect(originalBounds.width).toBeGreaterThanOrEqual(240);
      expect(movedBounds.width).toBeGreaterThanOrEqual(240);
      expect(originalBounds.height).toBeGreaterThanOrEqual(160);
      expect(movedBounds.height).toBeGreaterThanOrEqual(160);
      expect(movedBounds.left).toBeGreaterThanOrEqual(originalBounds.right - 1);
      expect(movedBounds.top).toBeCloseTo(originalBounds.top, 0);
    });
  },
};
