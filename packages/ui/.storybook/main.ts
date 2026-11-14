import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: [
    "../src/design-system/**/*.storybook.tsx",
    "../src/components/**/*.storybook.tsx",
    "../src/pages/**/*.storybook.tsx",
    "../src/App/**/*.storybook.tsx",
  ],
  experimental_indexers: async (indexers = []) =>
    indexers.map((indexer) =>
      indexer.test.test("Component.stories.tsx")
        ? { ...indexer, test: /\.(stories|story|storybook)\.[jt]sx?$/ }
        : indexer,
    ),
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  typescript: { reactDocgen: "react-docgen-typescript" },
};

// oxlint-disable-next-line import/no-default-export -- Storybook loads its configuration by default export.
export default config;
