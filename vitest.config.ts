import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      {
        find: /^@comma-agents\/core\/(.+)$/,
        replacement: resolve(
          import.meta.dirname,
          "packages/core/src/$1/index.ts",
        ),
      },
      {
        find: "@comma-agents/core",
        replacement: resolve(import.meta.dirname, "packages/core/src/index.ts"),
      },
      {
        find: "@comma-agents/daemon/protocol",
        replacement: resolve(
          import.meta.dirname,
          "packages/daemon/src/daemon-server/protocol.ts",
        ),
      },
      {
        find: "@comma-agents/daemon",
        replacement: resolve(
          import.meta.dirname,
          "packages/daemon/src/index.ts",
        ),
      },
      {
        find: "@comma-agents/utils",
        replacement: resolve(
          import.meta.dirname,
          "packages/utils/src/index.ts",
        ),
      },
      {
        find: "@comma-agents/tui",
        replacement: resolve(import.meta.dirname, "packages/tui/src/index.ts"),
      },
    ],
  },
  server: {
    fs: { allow: [import.meta.dirname, tmpdir(), "/private/var/folders"] },
  },
  esbuild: { jsx: "automatic" },
  test: {
    include: [
      "packages/{core,daemon,cli,tui,utils,debug}/src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.ts",
      "examples/e2e/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    restoreMocks: true,
    update: false,
    coverage: {
      provider: "v8",
      thresholds: { lines: 90, functions: 90, statements: 90 },
      exclude: [
        "**/*.test.*",
        "**/test.utils.*",
        "**/*.test.utils.*",
        "**/dist/**",
      ],
    },
  },
});
