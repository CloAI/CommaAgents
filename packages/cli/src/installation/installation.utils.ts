import { realpathSync } from "node:fs";

import { CLI_PACKAGE_NAME } from "./installation.constants";
import type {
  CliInstallation,
  ResolveInstallationOptions,
} from "./installation.types";

function hasPathSegment(path: string, segment: string): boolean {
  return path.split(/[\\/]+/).includes(segment);
}

/** Resolve how the currently running CLI was installed. */
export function resolveCliInstallation({
  standaloneBuild,
  executablePath,
  cliEntrypoint,
}: ResolveInstallationOptions): CliInstallation {
  if (standaloneBuild) {
    return { type: "standalone", executablePath };
  }

  let resolvedEntrypoint = cliEntrypoint;
  if (cliEntrypoint !== undefined) {
    try {
      resolvedEntrypoint = realpathSync(cliEntrypoint);
    } catch {}
  }

  if (
    resolvedEntrypoint === undefined ||
    !resolvedEntrypoint
      .replaceAll("\\", "/")
      .includes("/node_modules/@comma-agents/cli/")
  ) {
    return { type: "development", entrypoint: resolvedEntrypoint };
  }

  if (
    hasPathSegment(resolvedEntrypoint, ".bun") ||
    resolvedEntrypoint
      .replaceAll("\\", "/")
      .includes("/bun/install/global/node_modules/")
  ) {
    return { type: "package", manager: "bun" };
  }
  if (hasPathSegment(resolvedEntrypoint, "pnpm")) {
    return { type: "package", manager: "pnpm" };
  }
  if (hasPathSegment(resolvedEntrypoint, "yarn")) {
    return { type: "package", manager: "yarn" };
  }
  return { type: "package", manager: "npm" };
}

/** Build the package-manager command for installing a specific CLI version. */
export function buildPackageUpdateCommand(
  manager: Extract<CliInstallation, { type: "package" }>["manager"],
  version: string,
  executablePath = process.execPath,
): readonly string[] {
  const packageVersion = `${CLI_PACKAGE_NAME}@${version}`;
  switch (manager) {
    case "bun":
      return [executablePath, "add", "--global", packageVersion];
    case "npm":
      return ["npm", "install", "--global", packageVersion];
    case "pnpm":
      return ["pnpm", "add", "--global", packageVersion];
    case "yarn":
      return ["yarn", "global", "add", packageVersion];
  }
}

/** Build the package-manager command for removing the CLI. */
export function buildPackageRemovalCommand(
  manager: Extract<CliInstallation, { type: "package" }>["manager"],
  executablePath = process.execPath,
): readonly string[] {
  switch (manager) {
    case "bun":
      return [executablePath, "remove", "--global", CLI_PACKAGE_NAME];
    case "npm":
      return ["npm", "uninstall", "--global", CLI_PACKAGE_NAME];
    case "pnpm":
      return ["pnpm", "remove", "--global", CLI_PACKAGE_NAME];
    case "yarn":
      return ["yarn", "global", "remove", CLI_PACKAGE_NAME];
  }
}
