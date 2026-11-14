import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, spyOn, userEvent, within } from "storybook/test";
import { AppProviders, prepareStory } from "../../../test.utils";
import { loadSettings } from "../../../settings";
import { AppearanceSettings } from "./AppearanceSettings";

const meta = {
  title: "Components/SettingsDialog/AppearanceSettings",
  component: AppearanceSettings,
  args: { onClose: fn() },
  decorators: [
    (Story) => (
      <AppProviders>
        <div style={{ height: "90vh", maxWidth: "48rem" }}>
          <Story />
        </div>
      </AppProviders>
    ),
  ],
  beforeEach: () => prepareStory(),
} satisfies Meta<typeof AppearanceSettings>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const EditAndDiscard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Customize copy" }),
    );
    await userEvent.clear(canvas.getByRole("textbox", { name: "Theme name" }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Theme name" }),
      "Unsaved colors",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Discard" }));
    await expect(
      canvas.queryByRole("textbox", { name: "Theme name" }),
    ).not.toBeInTheDocument();
    await expect(
      loadSettings().settings.appearance?.customThemes ?? [],
    ).toHaveLength(0);
  },
};
export const CreateEditDuplicateAndDelete: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Customize copy" }),
    );
    const name = canvas.getByRole("textbox", { name: "Theme name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Review theme");
    await userEvent.click(canvas.getByRole("button", { name: "Save theme" }));
    await expect(
      loadSettings().settings.appearance?.customThemes[0]?.name,
    ).toBe("Review theme");
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await userEvent.clear(canvas.getByRole("textbox", { name: "Theme name" }));
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Theme name" }),
      "Edited review",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save theme" }));
    await expect(loadSettings().settings.appearance?.customThemes).toHaveLength(
      1,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Duplicate" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save theme" }));
    await expect(loadSettings().settings.appearance?.customThemes).toHaveLength(
      2,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await userEvent.click(canvas.getByRole("button", { name: "Keep" }));
    await expect(loadSettings().settings.appearance?.customThemes).toHaveLength(
      2,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Confirm delete" }),
    );
    await expect(loadSettings().settings.appearance?.customThemes).toHaveLength(
      1,
    );
    await expect(loadSettings().settings.appearance?.themeId).toBe("comma");
  },
};
export const InvalidName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Customize copy" }),
    );
    await userEvent.clear(canvas.getByRole("textbox", { name: "Theme name" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save theme" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Enter a theme name",
    );
    await expect(
      loadSettings().settings.appearance?.customThemes ?? [],
    ).toHaveLength(0);
  },
};
export const StorageFailureKeepsDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Customize copy" }),
    );
    const storage = spyOn(Storage.prototype, "setItem").mockImplementation(
      () => {
        throw new Error("Storage unavailable");
      },
    );
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Save theme" }));
      await expect(canvas.getByRole("alert")).toBeVisible();
      await expect(
        canvas.getByRole("textbox", { name: "Theme name" }),
      ).toHaveValue("Comma copy");
    } finally {
      storage.mockRestore();
    }
    await userEvent.click(canvas.getByRole("button", { name: "Save theme" }));
    await expect(
      loadSettings().settings.appearance?.customThemes[0]?.name,
    ).toBe("Comma copy");
  },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: "20rem", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
