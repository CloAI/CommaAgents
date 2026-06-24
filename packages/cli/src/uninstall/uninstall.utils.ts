import { realpathSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  CLI_PACKAGE_NAME,
  HISTORY_DATA_ENTRIES,
  PACKAGE_DATA_ENTRIES,
} from "./uninstall.constants";
import type {
  CommaInstallation,
  ResolveInstallationOptions,
  UninstallSelections,
} from "./uninstall.types";

function hasPathSegment(path: string, segment: string): boolean {
  return path.split(/[\\/]+/).includes(segment);
}

/** Resolve how the currently running CLI was installed. */
export function resolveCommaInstallation({
  standaloneBuild,
  executablePath,
  cliEntrypoint,
}: ResolveInstallationOptions): CommaInstallation {
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
    return {
      type: "package",
      manager: "bun",
      command: [executablePath, "remove", "--global", CLI_PACKAGE_NAME],
    };
  }
  if (hasPathSegment(resolvedEntrypoint, "pnpm")) {
    return {
      type: "package",
      manager: "pnpm",
      command: ["pnpm", "remove", "--global", CLI_PACKAGE_NAME],
    };
  }
  if (hasPathSegment(resolvedEntrypoint, "yarn")) {
    return {
      type: "package",
      manager: "yarn",
      command: ["yarn", "global", "remove", CLI_PACKAGE_NAME],
    };
  }
  return {
    type: "package",
    manager: "npm",
    command: ["npm", "uninstall", "--global", CLI_PACKAGE_NAME],
  };
}

/** Remove the selected categories from the shared CommaAgents data directory. */
export async function removeSelectedData(
  dataDirectory: string,
  selections: UninstallSelections,
): Promise<void> {
  const preservedEntries = new Set<string>();
  if (!selections.removeHistory) {
    for (const entry of HISTORY_DATA_ENTRIES) preservedEntries.add(entry);
  }
  if (!selections.removePackages) {
    for (const entry of PACKAGE_DATA_ENTRIES) preservedEntries.add(entry);
  }

  if (selections.removeConfig) {
    if (preservedEntries.size === 0) {
      await rm(dataDirectory, { recursive: true, force: true });
      return;
    }

    let entries: string[];
    try {
      entries = await readdir(dataDirectory);
    } catch (caughtError) {
      if ((caughtError as NodeJS.ErrnoException).code === "ENOENT") return;
      throw caughtError;
    }
    await Promise.all(
      entries
        .filter((entry) => !preservedEntries.has(entry))
        .map((entry) =>
          rm(join(dataDirectory, entry), {
            recursive: true,
            force: true,
          }),
        ),
    );
    return;
  }

  const entriesToRemove = [
    ...(selections.removeHistory ? HISTORY_DATA_ENTRIES : []),
    ...(selections.removePackages ? PACKAGE_DATA_ENTRIES : []),
  ];
  await Promise.all(
    entriesToRemove.map((entry) =>
      rm(join(dataDirectory, entry), {
        recursive: true,
        force: true,
      }),
    ),
  );
}
