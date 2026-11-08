import { defineConfig } from "vitest/config";
import { sourceAliases } from "./source-aliases";

// oxlint-disable-next-line import/no-default-export -- Vitest loads its configuration by default export.
export default defineConfig({
  resolve: { alias: sourceAliases },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
