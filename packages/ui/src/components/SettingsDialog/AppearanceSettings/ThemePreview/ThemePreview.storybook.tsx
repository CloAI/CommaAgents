import type { Meta, StoryObj } from "@storybook/react-vite";
import { BUILT_IN_THEMES } from "../../../../theme";
import { ThemePreview } from "./ThemePreview";

const meta = {
  title: "Components/SettingsDialog/AppearanceSettings/ThemePreview",
  component: ThemePreview,
  args: { palette: BUILT_IN_THEMES[0]!.dark },
} satisfies Meta<typeof ThemePreview>;

// oxlint-disable-next-line import/no-default-export -- Storybook requires default metadata.
export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};
export const Light: Story = { args: { palette: BUILT_IN_THEMES[0]!.light } };
export const DarkThemes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {BUILT_IN_THEMES.map((theme) => (
        <section key={theme.id} aria-label={theme.name}>
          <h2>{theme.name}</h2>
          <ThemePreview palette={theme.dark} />
        </section>
      ))}
    </div>
  ),
};
export const LightThemes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {BUILT_IN_THEMES.map((theme) => (
        <section key={theme.id} aria-label={theme.name}>
          <h2>{theme.name}</h2>
          <ThemePreview palette={theme.light} />
        </section>
      ))}
    </div>
  ),
};
