import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { exampleProviders } from "../SettingsDialog/ProvidersSettings/test.utils";
import { ModelBrowser } from "./ModelBrowser";

const meta = {
  title: "Components/ModelBrowser",
  component: ModelBrowser,
  args: { providers: exampleProviders, isLoading: false },
  parameters: {
    docs: {
      description: {
        component:
          "Filterable provider and model catalog. In manage mode it offers provider actions; with `onPick` it becomes a model chooser that can mark the current choice and disable models with a reason.",
      },
    },
  },
} satisfies Meta<typeof ModelBrowser>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const Manage: Story = {
  args: { onAddModel: fn(), onConfigure: fn(), onRefresh: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Add model" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Configure Alpha" }),
    ).toBeVisible();
  },
};

export const PickHidesManagementActions: Story = {
  args: { onPick: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Add model" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Configure/ }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Refresh/ })).toBeNull();
  },
};

export const PickChoosesModel: Story = {
  args: { onPick: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Alpha/ }));
    await userEvent.click(
      canvas.getByRole("button", { name: /^Reasoner Alpha/ }),
    );
    await expect(args.onPick).toHaveBeenCalledTimes(1);
    await expect(args.onPick).toHaveBeenCalledWith(
      expect.objectContaining({ id: "alpha" }),
      expect.objectContaining({ id: "reasoner" }),
    );
  },
};

export const PickMarksCurrentChoiceAndExpandsItsProvider: Story = {
  args: {
    onPick: fn(),
    selected: { providerId: "alpha", modelId: "reasoner" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const current = canvas.getByRole("button", {
      name: /^Reasoner Alpha/,
    });
    await expect(current).toHaveAttribute("aria-current", "true");
    await expect(canvas.getByText("Selected")).toBeVisible();
    // Other providers stay collapsed.
    await expect(
      canvas.queryByRole("button", { name: /^All rounder Beta/ }),
    ).toBeNull();
  },
};

export const PickDisablesModelsWithAReason: Story = {
  args: {
    onPick: fn(),
    isDisabled: (_provider, model) =>
      model.id === "vision-tools" ? "Not for this step" : undefined,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Alpha/ }));
    const blocked = canvas.getByRole("button", {
      name: /^Vision tools Alpha/,
    });
    await expect(blocked).toBeDisabled();
    await expect(canvas.getByText("Not for this step")).toBeVisible();
    await expect(args.onPick).not.toHaveBeenCalled();
  },
};

export const PickSearchRevealsMatches: Story = {
  args: { onPick: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search providers and models" }),
      "reasoner",
    );
    await expect(
      canvas.getByRole("button", { name: /^Reasoner Alpha/ }),
    ).toBeVisible();
  },
};
