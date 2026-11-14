import { chmodSync, rmSync, readFileSync } from "node:fs";
import { build } from "rolldown";
import { assertReleasePackageEntrypoints } from "./release-package-resolver";

const packageManifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  readonly version: string;
  readonly dependencies: Record<string, string>;
};
assertReleasePackageEntrypoints();
rmSync("dist", { recursive: true, force: true });
await build({
  input: "src/main.ts",
  platform: "node",
  external: (specifier) =>
    Object.keys(packageManifest.dependencies).some(
      (dependency) =>
        specifier === dependency || specifier.startsWith(`${dependency}/`),
    ),
  transform: {
    target: "node26",
    jsx: { runtime: "automatic" },
    define: {
      "process.env.COMMA_BUILD_VERSION": JSON.stringify(
        packageManifest.version,
      ),
      "process.env.COMMA_STANDALONE_BUILD": JSON.stringify("0"),
    },
  },
  output: {
    dir: "dist",
    entryFileNames: "comma.js",
    format: "esm",
    minify: true,
    sourcemap: true,
  },
});
chmodSync("dist/comma.js", 0o755);
