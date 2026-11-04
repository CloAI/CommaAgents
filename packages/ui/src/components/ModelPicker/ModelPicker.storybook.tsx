import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { exampleProviders } from "../SettingsDialog/ProvidersSettings/test.utils";
import { ModelPicker } from "./ModelPicker";

const meta = {
  title: "Components/ModelPicker",
  component: ModelPicker,
  args: { providers: exampleProviders, isLoading: false, onPick: fn() },
  parameters: {
    docs: {
      description: {
        component:
          "Filterable model catalog for choosing one model. It marks the current choice, expands its provider, and disables models with a reason.",
      },
    },
  },
} satisfies Meta<typeof ModelPicker>;

// oxlint-disable-next-line import/no-default-export -- Colocated Storybook stories require a default metadata export.
export default meta;
type Story = StoryObj<typeof meta>;

export const HidesManagementActions: Story = {
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

export const ChoosesModel: Story = {
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

export const MarksCurrentChoiceAndExpandsItsProvider: Story = {
  args: { selected: { providerId: "alpha", modelId: "reasoner" } },
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

export const DisablesModelsWithAReason: Story = {
  args: {
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

export const SearchRevealsMatches: Story = {
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

export const ExplainsAProviderWithoutModels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by provider" }),
    );
    await userEvent.click(canvas.getByRole("option", { name: /^Empty/ }));
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Filter by capabilities" }),
    );
    await userEvent.click(canvas.getByRole("option", { name: "Reasoning" }));
    await userEvent.keyboard("{Escape}");
    await expect(
      canvas.getByText("This provider has no models in the catalog."),
    ).toBeVisible();
  },
};
