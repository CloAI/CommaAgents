import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Vite config consumed by Storybook (`@storybook/react-vite` merges this in).
 *
 * Ink and many of its transitive deps reach into Node built-ins
 * (`stream`, `events`, `process`, `buffer`, `util`, `tty`). The polyfill
 * plugin shims most of them; we add local shims for `node:process` and
 * `node:child_process` because the plugin's defaults don't re-export the
 * named bindings (cwd, env, execFileSync, ...) that Ink imports.
 */
export default defineConfig({
  plugins: [
    nodePolyfills({
      protocolImports: true,
      // Don't auto-inject Buffer/process imports into every source file —
      // that breaks resolution from packages outside this dir's node_modules
      // under bun's hoisted workspace layout. We expose them via `define`
      // and explicit imports instead.
      globals: { Buffer: false, global: true, process: false },
      // We provide our own richer process / child_process shims via aliases.
      exclude: ["process", "child_process"],
    }),
  ],
  resolve: {
    alias: [
      // Only alias the `node:` protocol form. Bare `process` and
      // `child_process` continue to resolve to the npm polyfill packages
      // — that's important so our shim itself can `import nodeProcess
      // from "process"` without creating a self-referential alias loop.
      { find: /^node:process$/, replacement: r("./src/shims/process.ts") },
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
