import type { Preview } from "@storybook/react-vite";
import { BUILT_IN_THEMES, themeCssVariables } from "../src/theme";
import "../src/styles/global.scss";

const preview: Preview = {
  tags: ["autodocs"],
  globalTypes: {
    appearancePreview: {
      description:
        "Preview controls in a fixed Comma palette, or let the app manage its theme.",
      toolbar: {
        title: "Appearance",
        icon: "circlehollow",
        dynamicTitle: true,
        items: [
          { value: "app", title: "App theme" },
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => {
      const mode = context.globals.appearancePreview;
      if (mode !== "dark" && mode !== "light") {
        return <Story />;
      }
      return (
        <div
          style={{
            ...themeCssVariables(BUILT_IN_THEMES[0]![mode]),
            colorScheme: mode,
            background: "var(--color-canvas)",
            color: "var(--color-text)",
            minHeight:
              context.parameters.layout === "fullscreen"
                ? "100vh"
                : "calc(100vh - 2rem)",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    layout: "padded",
    backgrounds: {
      options: {
        dark: { name: "Comma dark", value: "#0B090F" },
        light: { name: "Comma light", value: "#fdf9ff" },
      },
    },
    controls: { expanded: true },
    a11y: { test: "error" },
    options: {
      storySort: {
        order: [
          "Design System",
          "Components",
          "Pages",
          "Screens",
          "Settings",
          "Hooks",
        ],
      },
    },
  },
  initialGlobals: { backgrounds: { value: "dark" }, appearancePreview: "app" },
};

// oxlint-disable-next-line import/no-default-export -- Storybook loads its configuration by default export.
export default preview;
