import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  HISTORY_DATA_ENTRIES,
  PACKAGE_DATA_ENTRIES,
} from "./uninstall.constants";
import type { UninstallSelections } from "./uninstall.types";

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
