import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Vite config consumed by Storybook (`@storybook/react-vite` merges this in).
 *
 * Ink and many of its transitive deps reach into Node built-ins
 * (`stream`, `events`, `process`, and `fs`). Alias only the built-ins Ink
 * actually imports so the browser preview does not pull in a broad Node
 * polyfill dependency tree.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^node:stream$/, replacement: "readable-stream" },
      { find: /^node:events$/, replacement: "events" },
      { find: /^node:process$/, replacement: r("./src/shims/process.ts") },
      { find: /^node:fs$/, replacement: r("./src/shims/fs.ts") },
      { find: /^node:tty$/, replacement: r("./src/shims/tty.ts") },
      { find: /^(?:node:)?os$/, replacement: r("./src/shims/os.ts") },
      { find: /^node:path$/, replacement: r("./src/shims/path.ts") },
      { find: /^module$/, replacement: r("./src/shims/module.ts") },
      {
        find: /^node:child_process$/,
        replacement: r("./src/shims/child_process.ts"),
      },
    ],
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "development",
    ),
  },
  optimizeDeps: {
    include: [
      "ink",
      "react",
      "react/jsx-runtime",
      "@xterm/xterm",
      "@xterm/addon-fit",
    ],
    esbuildOptions: {
      target: "es2022",
      supported: { "top-level-await": true },
    },
  },
  build: { target: "es2022" },
  esbuild: { target: "es2022", supported: { "top-level-await": true } },
});
