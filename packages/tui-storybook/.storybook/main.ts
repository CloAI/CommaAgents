import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { StorybookConfig } from "@storybook/react-vite";

const require = createRequire(import.meta.url);

const config: StorybookConfig = {
  framework: {
    name: getAbsolutePath("@storybook/react-vite"),
    options: {},
  },
  stories: [
    // Co-located with components in the tui package.
    "../../tui/src/**/*.stories.@(ts|tsx|mdx)",
  ],
  addons: [getAbsolutePath("@storybook/addon-docs")],
  typescript: {
    reactDocgen: false,
  },
};

export default config;

function getAbsolutePath(value: string): any {
  return dirname(require.resolve(`${value}/package.json`));
}
