import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Select } from "./Select";
import type { SelectOption, SelectProps } from "./Select.types";
import { Modal } from "../Modal";

const OPTIONS: SelectProps["options"] = [
  {
    value: "plan",
    label: "Plan",
    description: "Break a goal into reviewed steps.",
    tag: "Built-in",
  },
  {
    value: "build",
    label: "Build",
    description: "Implement and verify changes.",
    tag: "Project",
  },
  { value: "review", label: "Review" },
];

// Hold the selected value so stories exercise the controlled contract.
function ControlledSelect(props: SelectProps) {
  const [value, setValue] = useState(props.value);
  return (
    <Select
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange(next);
      }}
    />
  );
}

const meta = {
  title: "Design System/Select",
  component: Select,
  render: (args) => <ControlledSelect {...args} />,
  args: {
    label: "Strategy",
    options: OPTIONS,
    value: "plan",
    placeholder: "Select strategy",
    onChange: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          "Single-choice listbox with a compact trigger. Options may carry a description and a tag. Enter, Space, and arrow keys open the list; arrows, Home, and End move; Enter or Space chooses; Escape closes without choosing. Focus stays on the trigger.",
      },
    },
  },
} satisfies Meta<typeof Select>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const StaysInsideTheWindowOutsideAClippedPane: Story = {
  args: { searchable: true },
  render: (args) => (
    <div
      role="group"
      aria-label="Clipped pane"
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        width: 160,
        height: 40,
        overflow: "hidden",
        transform: "translateZ(0)",
      }}
    >
      <ControlledSelect {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Strategy:/ });
    await userEvent.click(trigger);
    const panel = canvas.getByRole("dialog", { name: "Strategy" });
    await waitFor(() => {
      const bounds = panel.getBoundingClientRect();
      const anchor = trigger.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(7);
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth - 7);
      expect(bounds.top).toBeGreaterThanOrEqual(7);
      expect(bounds.bottom).toBeLessThanOrEqual(anchor.top - 3);
      expect(panel.matches(":popover-open")).toBe(true);
      expect(
        panel.contains(
          document.elementFromPoint(bounds.left + 12, bounds.top + 12),
        ),
      ).toBe(true);
    });
    // Moving the anchor must reposition the same open panel, including changing sides.
    const pane = canvas.getByRole("group", { name: "Clipped pane" });
    Object.assign(pane.style, {
      top: "8px",
      left: "8px",
      bottom: "auto",
      right: "auto",
    });
    await waitFor(() => {
      const bounds = panel.getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(
        trigger.getBoundingClientRect().bottom + 3,
      );
      expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight - 7);
      expect(bounds.left).toBeGreaterThanOrEqual(7);
    });
    await userEvent.click(canvas.getByRole("option", { name: /Build/ }));
    await expect(trigger).toHaveTextContent("Build");
    await expect(trigger).toHaveFocus();
  },
};

export const RemainsInteractiveInsideAModal: Story = {
  args: { searchable: true },
  render: (args) => (
    <Modal open title="Choose a strategy" onClose={() => {}}>
      <ControlledSelect {...args} />
    </Modal>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = page.getByRole("button", { name: /^Strategy:/ });
    await userEvent.click(trigger);
    const panel = page.getByRole("dialog", { name: "Strategy" });
    const search = page.getByRole("combobox", { name: "Strategy search" });
    await expect(search).toHaveFocus();
    await waitFor(() => {
      const bounds = panel.getBoundingClientRect();
      expect(
        panel.contains(
          document.elementFromPoint(bounds.left + 12, bounds.top + 12),
        ),
      ).toBe(true);
    });
    await userEvent.keyboard("{Escape}");
    await expect(page.queryByRole("dialog", { name: "Strategy" })).toBeNull();
    await expect(
      page.getByRole("dialog", { name: "Choose a strategy" }),
    ).toBeVisible();
    await expect(trigger).toHaveFocus();
  },
};

export const Default: Story = {};
export const Placeholder: Story = { args: { value: undefined } };
export const Disabled: Story = {
  args: { disabled: true, placeholder: "No strategies found" },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("combobox", {
      name: "Strategy",
    });
    await expect(trigger).toBeDisabled();
    await expect(trigger).toHaveTextContent("No strategies found");
  },
};
export const ChooseWithPointer: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Strategy" });
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(canvas.getByRole("option", { name: /Build/ }));
    await expect(args.onChange).toHaveBeenCalledWith("build");
    await expect(canvas.queryByRole("listbox")).toBeNull();
    await expect(trigger).toHaveTextContent("Build");
    await expect(trigger).toHaveFocus();
  },
};
export const ChooseWithKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Strategy" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("listbox")).toBeVisible();
    // The selected option starts highlighted.
    await expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      canvas.getByRole("option", { name: /Plan/ }).id,
    );
    await userEvent.keyboard("{End}");
    await expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      canvas.getByRole("option", { name: /Review/ }).id,
    );
    await userEvent.keyboard("{Home}{ArrowDown}{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("build");
    await expect(trigger).toHaveTextContent("Build");
    await expect(canvas.queryByRole("listbox")).toBeNull();
  },
};
export const EscapeAndOutsideClose: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Strategy" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("listbox")).toBeNull();
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await expect(canvas.getByRole("listbox")).toBeVisible();
    await userEvent.click(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvas.queryByRole("listbox")).toBeNull());
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

const GROUPED: readonly SelectOption[] = [
  {
    value: "plan",
    label: "Plan",
    description: "Break a goal into reviewed steps.",
    tag: "Project",
    group: "Project",
    keywords: "Plan Project",
  },
  {
    value: "build",
    label: "Build",
    description: "Implement and verify changes.",
    tag: "User",
    group: "Project",
    keywords: "Build Project",
  },
  {
    value: "review",
    label: "Acme > Review",
    description: "Review a change set.",
    tag: "Hub",
    group: "Hub",
    keywords: "Review Hub",
  },
  { value: "talk", label: "Talk", tag: "Built-in", keywords: "Talk " },
];
const searchable = {
  options: GROUPED,
  value: "plan",
  searchable: true,
  searchPlaceholder: "Search strategies...",
  groupOrder: ["Project", "Hub"],
  emptyMessage: "No strategies match",
} satisfies Partial<SelectProps>;

// Open a searchable select and return its search field and canvas helpers.
async function openSearch(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: /^Strategy/ }));
  const search = canvas.getByRole("combobox", { name: "Strategy search" });
  await expect(search).toHaveFocus();
  const names = () =>
    canvas.queryAllByRole("option").map((option) => option.textContent ?? "");
  return { canvas, search, names };
}

export const SearchableGrouped: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { canvas, names } = await openSearch(canvasElement);
    // Groups in order, sorted by label, with ungrouped strategies last.
    await expect(
      canvas
        .getAllByRole("group")
        .map((group) => group.firstChild?.textContent),
    ).toEqual(["Project", "Hub"]);
    await expect(
      names().map((name) => name.split(/Project|User|Hub|Built-in/)[0]),
    ).toEqual(["Build", "Plan", "Acme > Review", "Talk"]);
  },
};
export const SearchNarrowsAndHighlights: Story = {
  args: searchable,
  play: async ({ canvasElement, args }) => {
    const { canvas, search, names } = await openSearch(canvasElement);
    await userEvent.type(search, "build");
    await expect(names()).toHaveLength(1);
    await expect(
      canvas.getByRole("option").querySelector("mark"),
    ).toHaveTextContent("Build");
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("build");
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await expect(
      canvas.getByRole("button", { name: /^Strategy/ }),
    ).toHaveFocus();
  },
};
export const SearchRequiresEveryTerm: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { search, names } = await openSearch(canvasElement);
    // Terms may match different fields: the label and the description.
    await userEvent.type(search, "plan break");
    await expect(names()).toHaveLength(1);
    await userEvent.clear(search);
    // The origin word is searchable.
    await userEvent.type(search, "hub");
    await expect(names()).toHaveLength(1);
    await userEvent.clear(search);
    await userEvent.type(search, "plan nothing");
    await expect(names()).toHaveLength(0);
  },
};
export const FilterChips: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { canvas, names } = await openSearch(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Hub" }));
    await expect(canvas.getByRole("radio", { name: "Hub" })).toBeChecked();
    await expect(names()).toHaveLength(1);
    await userEvent.click(canvas.getByRole("radio", { name: "Project" }));
    await expect(names()).toHaveLength(2);
    // Ungrouped strategies appear under All only.
    await userEvent.click(canvas.getByRole("radio", { name: "All" }));
    await expect(names()).toHaveLength(4);
  },
};
export const ArrowKeysCycleChips: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { canvas, search } = await openSearch(canvasElement);
    const checked = () =>
      canvas.getAllByRole("radio").find((chip) => chip.ariaChecked === "true")
        ?.textContent;
    await expect(checked()).toBe("All");
    await userEvent.keyboard("{ArrowRight}");
    await expect(checked()).toBe("Project");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect(checked()).toBe("All");
    await userEvent.keyboard("{ArrowLeft}");
    await expect(checked()).toBe("Hub");
    // With text in the field the arrows belong to the caret.
    await userEvent.type(search, "a{ArrowLeft}");
    await expect(checked()).toBe("Hub");
    await expect(search).toHaveFocus();
  },
};
export const ChipsWithoutMatchesAreDisabled: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { canvas, search } = await openSearch(canvasElement);
    await userEvent.type(search, "talk");
    await expect(canvas.getByRole("radio", { name: "Project" })).toBeDisabled();
    await expect(canvas.getByRole("radio", { name: "Hub" })).toBeDisabled();
    await expect(canvas.getByRole("radio", { name: "All" })).toBeEnabled();
  },
};
export const EscapeClearsThenCloses: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { canvas, search, names } = await openSearch(canvasElement);
    await userEvent.type(search, "bui");
    await userEvent.keyboard("{Escape}");
    await expect(search).toHaveValue("");
    await expect(names()).toHaveLength(4);
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await expect(
      canvas.getByRole("button", { name: /^Strategy/ }),
    ).toHaveFocus();
  },
};
export const NoMatchCanBeCleared: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { canvas, search, names } = await openSearch(canvasElement);
    await userEvent.type(search, "zzz");
    await expect(canvas.getByText("No strategies match")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(search).toHaveValue("");
    await expect(search).toHaveFocus();
    await expect(names()).toHaveLength(4);
  },
};
export const ResetsOnEachOpen: Story = {
  args: searchable,
  play: async ({ canvasElement }) => {
    const { canvas, search } = await openSearch(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Hub" }));
    await userEvent.type(search, "rev");
    await userEvent.keyboard("{Escape}{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy/ }));
    const reopened = canvas.getByRole("combobox", { name: "Strategy search" });
    await expect(reopened).toHaveValue("");
    await expect(canvas.getByRole("radio", { name: "All" })).toBeChecked();
  },
};
export const KeyboardSelectionKeepsFocusInSearch: Story = {
  args: searchable,
  play: async ({ canvasElement, args }) => {
    const { canvas, search } = await openSearch(canvasElement);
    // The selected Plan starts highlighted, so one step reaches Review.
    await userEvent.keyboard("{ArrowDown}");
    await expect(search).toHaveFocus();
    await expect(search).toHaveAttribute(
      "aria-activedescendant",
      canvas.getAllByRole("option")[2]!.id,
    );
    await userEvent.keyboard("{Enter}");
    await expect(args.onChange).toHaveBeenCalledWith("review");
  },
};

export const DisabledOptionsShowTheirReason: Story = {
  args: {
    options: [
      { value: "ok", label: "Allowed", group: "Models" },
      {
        value: "blocked",
        label: "Blocked",
        group: "Models",
        disabled: "Requires E2EE support",
      },
    ],
    value: "ok",
    searchable: true,
    groupOrder: ["Models"],
  },
  play: async ({ canvasElement, args }) => {
    const { canvas } = await openSearch(canvasElement);
    const blocked = canvas.getByRole("option", { name: /^Blocked/ });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    await expect(canvas.getByText("Requires E2EE support")).toBeVisible();
    await userEvent.click(blocked);
    await expect(args.onChange).not.toHaveBeenCalled();
    await expect(canvas.getByRole("dialog")).toBeVisible();
    await userEvent.click(canvas.getByRole("option", { name: /^Allowed/ }));
    await expect(args.onChange).toHaveBeenCalledWith("ok");
  },
};
export const TriggerLabelOverridesTheSelectedLabel: Story = {
  args: { triggerLabel: "openai/not-listed", value: undefined },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("combobox", { name: "Strategy" }),
    ).toHaveTextContent("openai/not-listed");
  },
};

export const FitsContent: Story = {
  args: {
    searchable: true,
    options: [{ value: "short", label: "Short" }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^Strategy:/ }));
    const panel = canvas.getByRole("dialog", { name: "Strategy" });
    await expect(panel.getBoundingClientRect().width).toBeLessThan(26 * 16);
    await expect(panel.getBoundingClientRect().width).toBeLessThanOrEqual(
      window.innerWidth - 16,
    );
  },
};

export const CapsLongContentWithoutACustomWidth: Story = {
  args: {
    searchable: true,
    value: "long",
    options: [
      {
        value: "long",
        label: "Long strategy name ".repeat(16),
        description: "Long strategy description ".repeat(20),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /^Strategy:/ });
    const cap =
      24 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    await expect(trigger.getBoundingClientRect().width).toBeLessThanOrEqual(
      cap,
    );
    await userEvent.click(trigger);
    const panel = canvas.getByRole("dialog", { name: "Strategy" });
    await waitFor(() =>
      expect(panel.getBoundingClientRect().width).toBeLessThanOrEqual(cap),
    );
    await expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(
      window.innerWidth - 7,
    );
    await expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
  },
};
