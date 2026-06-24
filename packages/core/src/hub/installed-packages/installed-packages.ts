import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { InstalledHubPackage } from "../hub.types";
import type {
  CreateInstalledPackageStoreOptions,
  InstalledPackageState,
  InstalledPackageStore,
} from "./installed-packages.types";

/** Create the persistent store used to track installed Hub packages. */
export function createInstalledPackageStore({
  statePath,
}: CreateInstalledPackageStoreOptions): InstalledPackageStore {
  async function readState(): Promise<InstalledPackageState> {
    try {
      const parsed = JSON.parse(
        await readFile(statePath, "utf8"),
      ) as InstalledPackageState;
      return {
        packages: Array.isArray(parsed.packages) ? parsed.packages : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { packages: [] };
      throw error;
    }
  }

  async function writeState(
    packages: readonly InstalledHubPackage[],
  ): Promise<void> {
    await mkdir(dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ packages: [...packages].sort((firstPackage, secondPackage) => firstPackage.name.localeCompare(secondPackage.name)) }, null, 2)}\n`,
    );
    await rename(temporaryPath, statePath);
  }

  async function list(): Promise<readonly InstalledHubPackage[]> {
    return (await readState()).packages;
  }

  async function get(name: string): Promise<InstalledHubPackage | undefined> {
    return (await list()).find(
      (installedPackage) => installedPackage.name === name,
    );
  }

  return {
    list,
    get,
    async replace(installedPackage) {
      const state = await readState();
      await writeState([
        ...state.packages.filter(
          (statePackage) => statePackage.name !== installedPackage.name,
        ),
        installedPackage,
      ]);
    },
    async remove(name) {
      const installedPackage = await get(name);
      if (!installedPackage) return false;

      const backupPath = `${installedPackage.path}.${crypto.randomUUID()}.removing`;
      const state = await readState();
      await rename(installedPackage.path, backupPath);
      try {
        await writeState(
          state.packages.filter((statePackage) => statePackage.name !== name),
        );
        await rm(backupPath, { recursive: true, force: true });
        return true;
      } catch (error) {
        await rename(backupPath, installedPackage.path);
        throw error;
      }
    },
    async isExecutableCodeApproved(manifestPath) {
      const installedPackage = (await list()).find(
        (statePackage) =>
          resolve(statePackage.path, "comma-project.json") ===
          resolve(manifestPath),
      );
      return installedPackage?.executableCodeApproved ?? false;
    },
  };
}
