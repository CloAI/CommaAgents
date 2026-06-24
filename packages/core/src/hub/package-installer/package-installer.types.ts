import type {
  HubInstallOptions,
  HubPackage,
  HubRegistrySnapshot,
  InstalledHubPackage,
} from "../hub.types";
import type { InstalledPackageStore } from "../installed-packages";
import type { HubRegistryClient } from "../registry-client";

export interface CreateHubPackageInstallerOptions {
  readonly packagesRoot: string;
  readonly installedPackages: InstalledPackageStore;
  readonly registryClient: HubRegistryClient;
}

export interface HubPackageInstaller {
  install(
    project: HubPackage,
    snapshot: HubRegistrySnapshot,
    options: HubInstallOptions,
    replace: boolean,
  ): Promise<InstalledHubPackage>;
}
