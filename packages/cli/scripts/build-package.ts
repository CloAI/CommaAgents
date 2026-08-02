import { chmodSync, rmSync } from "node:fs";
import {
  assertReleasePackageEntrypoints,
  releasePackageResolver,
} from "./release-package-resolver";

const packageManifest = (await Bun.file("package.json").json()) as {
  readonly version: string;
};
assertReleasePackageEntrypoints();
rmSync("dist", { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: ["src/main.ts"],
  outdir: "dist",
  naming: "comma.js",
  target: "bun",
  minify: true,
  plugins: [releasePackageResolver],
  define: {
    "process.env.COMMA_BUILD_VERSION": JSON.stringify(packageManifest.version),
    "process.env.COMMA_STANDALONE_BUILD": JSON.stringify("0"),
  },
});

if (!result.success) {
  throw new AggregateError(result.logs, "Failed to build comma CLI");
}

chmodSync("dist/comma.js", 0o755);
