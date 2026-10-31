import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// oxlint-disable-next-line import/no-default-export -- Vitest loads its configuration by default export.
export default defineConfig({
  test: {
    projects: [
      // Pure logic runs in Node without a browser.
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      mergeConfig(
        viteConfig,
        defineConfig({
          plugins: [
            storybookTest({
              configDir: fileURLToPath(
                new URL("./.storybook", import.meta.url),
              ),
            }),
          ],
          test: {
            name: "storybook",
            browser: {
              enabled: true,
              headless: true,
              provider: "playwright",
              instances: [{ browser: "chromium" }],
            },
          },
        }),
      ),
    ],
  },
});
