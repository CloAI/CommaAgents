/**
 * Establishes Node-like globals (`Buffer`, `process`, `global`) on
 * `globalThis` so Ink and its transitive deps can access them at runtime.
 *
 * These globals are installed explicitly because the Storybook Vite config
 * aliases only the Node built-ins that the preview actually uses.
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
