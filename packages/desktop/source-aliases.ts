import { resolve } from "node:path";

const packages = resolve(import.meta.dirname, "..");

/** Daemon and core are used from source, so neither needs a build to develop or test. */
export const sourceAliases = [
  { find: "@daemon-src", replacement: resolve(packages, "daemon/src") },
  {
    find: /^@comma-agents\/core$/,
    replacement: resolve(packages, "core/src/index.ts"),
  },
  {
    find: /^@comma-agents\/core\/(hub|sandbox|strategy|skills|mcp|language|conversation-context)$/,
    replacement: `${resolve(packages, "core/src")}/$1/index.ts`,
  },
];
