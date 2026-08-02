import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BunPlugin } from "bun";

const releasePackageEntrypoints: Readonly<Record<string, string>> = {
  "@comma-agents/core/hub": resolve(
    import.meta.dir,
    "../../core/dist/hub/index.js",
  ),
  "@comma-agents/core/sandbox": resolve(
    import.meta.dir,
    "../../core/dist/sandbox/index.js",
  ),
  "@comma-agents/core": resolve(import.meta.dir, "../../core/dist/index.js"),
  "@comma-agents/daemon": resolve(
    import.meta.dir,
    "../../daemon/dist/index.js",
  ),
  "@comma-agents/tui": resolve(import.meta.dir, "../../tui/dist/index.js"),
};

export function assertReleasePackageEntrypoints(): void {
  const missingEntrypoints = Object.entries(releasePackageEntrypoints)
    .filter(([, path]) => !existsSync(path))
    .map(([specifier]) => specifier);
  if (missingEntrypoints.length > 0) {
    throw new Error(
      `Missing built release packages: ${missingEntrypoints.join(", ")}. Run bun run build from the repository root.`,
    );
  }
}

export const releasePackageResolver: BunPlugin = {
  name: "comma-release-packages",
  setup(build) {
    build.onResolve({ filter: /^@comma-agents\// }, (args) => {
      const path = releasePackageEntrypoints[args.path];
      if (path === undefined) {
        throw new Error(
          `The CLI release build cannot resolve workspace package ${args.path}`,
        );
      }
      return { path };
    });
  },
};
