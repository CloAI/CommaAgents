/** Runtime location overrides for Core-owned files and directories. */
export interface CoreDefaultOverrides {
  readonly applicationDataDirectory?: string;
  readonly credentialsPath?: string;
  readonly providerInstallDirectory?: string;
  readonly catalogCachePath?: string;
  readonly globalSkillsDirectory?: string;
}

/** @deprecated Use {@link CoreDefaultOverrides}. */
export type CoreLocationOverrides = CoreDefaultOverrides;
