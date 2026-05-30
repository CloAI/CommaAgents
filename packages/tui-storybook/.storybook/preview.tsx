import type { Preview } from "@storybook/react-vite";
// Establish Node-like globals BEFORE Ink (and friends) are imported below.
import "../src/global-shims";
import { XtermInkPreview } from "../src/XtermInkPreview";
import "@xterm/xterm/css/xterm.css";
import "../src/preview.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    backgrounds: {
      options: {
        terminal: { name: "terminal", value: "#0b0b0b" },
        light: { name: "light", value: "#f6f6f6" },
      },
    },
  },

  decorators: [
    (Story, context) => {
      const { cols, rows } = context.parameters.xterm ?? {};
      return (
        <XtermInkPreview cols={cols ?? 80} rows={rows ?? 24}>
          <Story />
        </XtermInkPreview>
      );
    },
  ],

  initialGlobals: {
    backgrounds: {
      value: "terminal",
    },
  },
};

export default preview;
