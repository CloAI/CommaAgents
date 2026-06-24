import { join } from "node:path";

import { resolveDataDir } from "../data-directory";
import {
  DEFAULT_HUB_REPOSITORY,
  HUB_INSTALLED_STATE_FILENAME,
} from "./hub.constants";
import type { CreateHubManagerOptions, HubManager } from "./hub.types";
import { findAvailableHubPackage } from "./hub.utils";
import { createInstalledPackageStore } from "./installed-packages";
import { createHubPackageInstaller } from "./package-installer";
import { createHubRegistryClient } from "./registry-client";

/**
 * Create a manager for discovering, installing, updating, and removing Hub packages.
 *
 * @param options - Optional data directory, repository, and fetch implementation.
 * @example
 * ```ts
 * const hub = createHubManager();
 * const packages = await hub.listAvailable();
 * await hub.install(packages[0].name);
 * ```
 */
export function createHubManager(
  options: CreateHubManagerOptions = {},
): HubManager {
  const dataDirectory = options.dataDir ?? resolveDataDir();
  const repository = options.repository ?? DEFAULT_HUB_REPOSITORY;
  const registryClient = createHubRegistryClient({
    repository,
    fetch: options.fetch ?? globalThis.fetch,
  });
  const installedPackages = createInstalledPackageStore({
    statePath: join(dataDirectory, "hub", HUB_INSTALLED_STATE_FILENAME),
  });
  const packageInstaller = createHubPackageInstaller({
    packagesRoot: join(dataDirectory, "packages"),
    installedPackages,
    registryClient,
  });

  return {
    refreshRegistry: registryClient.refresh,
    async listAvailable() {
      return (await registryClient.getSnapshot()).registry.packages;
    },
    listInstalled: installedPackages.list,
    async install(name, installOptions = {}) {
      const snapshot = await registryClient.getSnapshot();
      const project = findAvailableHubPackage(snapshot, name);
      return packageInstaller.install(project, snapshot, installOptions, false);
    },
    async update(name, installOptions = {}) {
      if (!(await installedPackages.get(name)))
        throw new Error(`Package ${name} is not installed`);

      const snapshot = await registryClient.refresh();
      const project = findAvailableHubPackage(snapshot, name);
      return packageInstaller.install(project, snapshot, installOptions, true);
    },
    remove: installedPackages.remove,
    getInstalled: installedPackages.get,
    isExecutableCodeApproved: installedPackages.isExecutableCodeApproved,
  };
}
