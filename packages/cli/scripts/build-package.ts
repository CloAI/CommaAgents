import { chmodSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const packageManifest = (await Bun.file("package.json").json()) as {
  readonly version: string;
};
// Bun.build's `alias` option does not honor scoped-package subpath keys
// (e.g. "@comma-agents/core/hub"), so workspace specifiers are resolved with
// an onResolve plugin that exact-matches each specifier to its source entry.
const workspaceAliases: Readonly<Record<string, string>> = {
  "@comma-agents/core/hub": resolve("../core/src/hub/index.ts"),
  "@comma-agents/core": resolve("../core/src/index.ts"),
  "@comma-agents/daemon": resolve("../daemon/src/index.ts"),
  "@comma-agents/tui": resolve("../tui/src/index.ts"),
  "@comma-agents/utils": resolve("../utils/src/index.ts"),
};

rmSync("dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  naming: "comma.js",
  target: "bun",
  minify: true,
  plugins: [
    {
      name: "comma-workspace-aliases",
      setup(build) {
        build.onResolve({ filter: /^@comma-agents\// }, (args) => {
          const path = workspaceAliases[args.path];
          return path === undefined ? undefined : { path };
        });
      },
    },
  ],
  define: {
    "process.env.COMMA_BUILD_VERSION": JSON.stringify(packageManifest.version),
    "process.env.COMMA_STANDALONE_BUILD": JSON.stringify("0"),
  },
});

if (!result.success) {
  throw new AggregateError(result.logs, "Failed to build comma CLI");
}

chmodSync("dist/comma.js", 0o755);
