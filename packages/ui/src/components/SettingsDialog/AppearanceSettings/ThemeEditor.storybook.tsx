import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { BUILT_IN_THEMES, cloneTheme } from "../../../theme";
import { ThemeEditor } from "./ThemeEditor";
import type { ThemeEditorProps } from "./ThemeEditor";

function EditorExample(args: ThemeEditorProps) {
  const [draft, setDraft] = useState(args.draft);
  const [mode, setMode] = useState(args.mode);
  return (
    <ThemeEditor
      {...args}
      draft={draft}
      mode={mode}
      onChange={(next) => {
        setDraft(next);
        args.onChange(next);
      }}
      onModeChange={setMode}
    />
  );
}
const meta = {
  title: "Components/SettingsDialog/AppearanceSettings/ThemeEditor",
  component: ThemeEditor,
  args: {
    draft: cloneTheme(BUILT_IN_THEMES[0]!, "custom-review", "Review theme"),
    mode: "dark",
    onChange: fn(),
    onModeChange: fn(),
  },
  render: (args) => <EditorExample {...args} />,
} satisfies Meta<typeof ThemeEditor>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const DarkPalette: Story = {};
export const LightPalette: Story = { args: { mode: "light" } };
export const EditsOnlyTheSelectedPalette: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Canvas hex" });
    fireEvent.change(input, { target: { value: "#123456" } });
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dark: expect.objectContaining({ canvas: "#123456" }),
        light: args.draft.light,
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Light palette" }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Canvas hex" }),
    ).toHaveValue(args.draft.light.canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Dark palette" }));
    await expect(
      canvas.getByRole("textbox", { name: "Canvas hex" }),
    ).toHaveValue("#123456");
  },
};
export const InvalidHexKeepsPreview: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const preview = canvas.getByRole("group", { name: "Theme preview" });
    const before = preview.style.getPropertyValue("--color-canvas");
    fireEvent.change(canvas.getByRole("textbox", { name: "Canvas hex" }), {
      target: { value: "#oops" },
    });
    await expect(preview.style.getPropertyValue("--color-canvas")).toBe(before);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};
