import { cpSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import { sourceAliases } from "./source-aliases";

/** Content security policy for the packaged renderer: no network, only bundled assets. */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Add the policy to built pages only, so the dev server can keep its hot-reload socket.
 * @returns {Plugin} Vite plugin that injects the policy meta tag.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "comma-content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: CONTENT_SECURITY_POLICY,
        },
        injectTo: "head-prepend",
      },
    ],
  };
}

/**
 * Core looks for its built-in strategies beside the running bundle, so place them there.
 * @returns {Plugin} Vite plugin that copies core's strategies next to the main bundle.
 */
function bundledStrategies(): Plugin {
  return {
    name: "comma-bundled-strategies",
    writeBundle({ dir }) {
      cpSync(
        resolve(import.meta.dirname, "../core/strategies"),
        join(dir ?? resolve(import.meta.dirname, "out/main"), "strategies"),
        { recursive: true },
      );
    },
  };
}

// oxlint-disable-next-line import/no-default-export -- electron-vite loads its configuration by default export.
export default defineConfig({
  main: {
    plugins: [bundledStrategies()],
    // Nothing is installed beside the bundle, so every dependency must be inside it.
    ssr: { noExternal: true },
    // Bundling the daemon from source also keeps its WebSocket server (and native uWS addon) out.
    resolve: { alias: sourceAliases },
    build: {
      // Some dependencies mix import and require; bundle both so nothing is resolved at runtime.
      commonjsOptions: { transformMixedEsModules: true },
      rollupOptions: {
        input: { main: resolve(import.meta.dirname, "src/main/main.ts") },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          preload: resolve(import.meta.dirname, "src/preload/preload.ts"),
        },
        // Sandboxed preload scripts cannot be ES modules.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(import.meta.dirname, "src/renderer"),
    resolve: {
      dedupe: ["react", "react-dom"],
      // The browser-safe wire schemas come from source, so no daemon build is needed.
      alias: {
        "@comma-agents/daemon/protocol": resolve(
          import.meta.dirname,
          "../daemon/src/daemon-server/protocol.ts",
        ),
      },
    },
    plugins: [contentSecurityPolicy()],
    build: {
      target: "es2022",
      rollupOptions: {
        input: resolve(import.meta.dirname, "src/renderer/index.html"),
      },
    },
  },
});
