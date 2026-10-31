import type { Preview } from "@storybook/react-vite";
import "../src/styles/global.scss";

const preview: Preview = {
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    backgrounds: {
      options: { dark: { name: "Comma dark", value: "#0B090F" } },
    },
    controls: { expanded: true },
    a11y: { test: "error" },
    options: {
      storySort: { order: ["Design System", "Components", "Screens"] },
    },
  },
  initialGlobals: { backgrounds: { value: "dark" } },
};

// oxlint-disable-next-line import/no-default-export -- Storybook loads its configuration by default export.
export default preview;
