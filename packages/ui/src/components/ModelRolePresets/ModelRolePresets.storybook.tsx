import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SettingsProvider } from "../../hooks/useSettings";
import { ModelRolePresets } from "./ModelRolePresets";

const meta = {
  title: "Components/ModelRolePresets",
  component: ModelRolePresets,
  decorators: [
    (Story) => (
      <SettingsProvider>
        <Story />
      </SettingsProvider>
    ),
  ],
  beforeEach: () => window.localStorage.removeItem("comma-agents.settings"),
  args: {
    roles: ["simple", "complex"],
    values: { simple: "openai/gpt-5-mini", complex: "openai/gpt-5" },
    onChange: fn(),
  },
} satisfies Meta<typeof ModelRolePresets>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const SavesAppliesAndDeletes: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const picker = canvas.getByRole("combobox", {
      name: "Model role configuration",
    });
    await userEvent.selectOptions(picker, "OpenAI balanced");
    await expect(args.onChange).toHaveBeenLastCalledWith({
      simple: "openai/gpt-5-mini",
      complex: "openai/gpt-5",
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Save configuration" }),
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Configuration name" }),
      "My models",
    );
    await expect(
      window.localStorage.getItem("comma-agents.settings"),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Confirm save" }));
    await expect(
      JSON.parse(window.localStorage.getItem("comma-agents.settings")!)
        .modelRolePresets["My models"],
    ).toEqual(args.values);
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await expect(
      canvas.getByRole("option", { name: "My models" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Confirm delete" }),
    );
    await expect(
      canvas.queryByRole("option", { name: "My models" }),
    ).not.toBeInTheDocument();
    await expect(
      JSON.parse(window.localStorage.getItem("comma-agents.settings")!)
        .modelRolePresets,
    ).toEqual({});
  },
};
