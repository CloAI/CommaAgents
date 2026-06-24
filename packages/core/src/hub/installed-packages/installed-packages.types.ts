import type { InstalledHubPackage } from "../hub.types";

export interface InstalledPackageStore {
  list(): Promise<readonly InstalledHubPackage[]>;
  get(name: string): Promise<InstalledHubPackage | undefined>;
  replace(installedPackage: InstalledHubPackage): Promise<void>;
  remove(name: string): Promise<boolean>;
  isExecutableCodeApproved(manifestPath: string): Promise<boolean>;
}

export interface CreateInstalledPackageStoreOptions {
  readonly statePath: string;
}

export interface InstalledPackageState {
  readonly packages: readonly InstalledHubPackage[];
}
