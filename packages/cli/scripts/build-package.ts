import { chmodSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const packageManifest = (await Bun.file("package.json").json()) as {
  readonly version: string;
};
const workspaceAliases = {
  "@comma-agents/core": resolve("../core/src/index.ts"),
  "@comma-agents/daemon": resolve("../daemon/src/index.ts"),
  "@comma-agents/tui": resolve("../tui/src/index.ts"),
};

rmSync("dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  naming: "comma.js",
  target: "bun",
  minify: true,
  alias: workspaceAliases,
  define: {
    "process.env.COMMA_BUILD_VERSION": JSON.stringify(packageManifest.version),
    "process.env.COMMA_STANDALONE_BUILD": JSON.stringify("0"),
  },
});

if (!result.success) {
  throw new AggregateError(result.logs, "Failed to build comma CLI");
}

chmodSync("dist/comma.js", 0o755);
