import type { z } from "zod";

import type {
  CommaProjectManifestSchema,
  HubEnvironmentVariableSchema,
  HubPackageSchema,
  HubPermissionsSchema,
  HubPersonSchema,
  HubRegistryArtifactSchema,
  HubRegistrySchema,
  ProjectArtifactEntrySchema,
} from "./hub.schema";

/** Public metadata for a person associated with a Hub project. */
export type HubPerson = z.infer<typeof HubPersonSchema>;
/** A declared environment variable used by a project. */
export type HubEnvironmentVariable = z.infer<
  typeof HubEnvironmentVariableSchema
>;
/** Runtime capabilities required by a project. */
export type HubPermissions = z.infer<typeof HubPermissionsSchema>;
/** One artifact declared by a project manifest. */
export type ProjectArtifactEntry = z.infer<typeof ProjectArtifactEntrySchema>;
/** Canonical `comma-project.json` contract inferred from the public schema. */
export type CommaProjectManifest = z.infer<typeof CommaProjectManifestSchema>;

export type HubArtifactKind = "strategies" | "agents" | "flows" | "tools";

export type HubRegistryArtifact = z.infer<typeof HubRegistryArtifactSchema>;
export type HubPackage = z.infer<typeof HubPackageSchema>;
export type HubRegistry = z.infer<typeof HubRegistrySchema>;

export interface HubRegistrySnapshot {
  readonly commit: string;
  readonly registry: HubRegistry;
}

export interface InstalledHubPackage {
  readonly name: string;
  readonly version: string;
  readonly commit: string;
  readonly path: string;
  readonly executableCodeApproved: boolean;
}

export interface HubInstallOptions {
  readonly allowCode?: boolean;
}

export interface HubRepositoryConfig {
  readonly owner: string;
  readonly repository: string;
  readonly branch: string;
}

export interface CreateHubManagerOptions {
  readonly dataDir?: string;
  readonly repository?: HubRepositoryConfig;
  readonly fetch?: typeof globalThis.fetch;
}

export interface HubManager {
  refreshRegistry(): Promise<HubRegistrySnapshot>;
  listAvailable(): Promise<readonly HubPackage[]>;
  listInstalled(): Promise<readonly InstalledHubPackage[]>;
  install(
    name: string,
    options?: HubInstallOptions,
  ): Promise<InstalledHubPackage>;
  update(
    name: string,
    options?: HubInstallOptions,
  ): Promise<InstalledHubPackage>;
  remove(name: string): Promise<boolean>;
  getInstalled(name: string): Promise<InstalledHubPackage | undefined>;
  isExecutableCodeApproved(manifestPath: string): Promise<boolean>;
}
