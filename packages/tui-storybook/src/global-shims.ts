/**
 * Establishes Node-like globals (`Buffer`, `process`, `global`) on
 * `globalThis` so Ink and its transitive deps can access them at runtime.
 *
 * We do this manually (instead of letting `vite-plugin-node-polyfills`
 * auto-inject imports into every source file) because that auto-injection
 * adds `import "vite-plugin-node-polyfills/shims/buffer"` to files in the
 * `@comma-agents/tui` package, whose `node_modules` lookup under bun's
 * hoisted workspace layout cannot resolve the plugin's deep path.
 *
 * The local binding is `nodeProcess` — NOT `process` — because Vite's
 * `define` rewrites the token `process.env.NODE_ENV` inside this file too,
 * which would otherwise produce a temporal-dead-zone error on the local
 * `process` identifier.
 */
import { Buffer } from "buffer";
import nodeProcess from "./shims/process";

const g = globalThis as unknown as {
  Buffer: typeof Buffer;
  process: typeof nodeProcess;
  global: typeof globalThis;
};

g.Buffer = Buffer;
g.process = nodeProcess;
g.global = globalThis;
