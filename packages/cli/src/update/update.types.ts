/** Downloadable file attached to a GitHub release. */
export interface ReleaseAsset {
  /** Published asset filename. */
  readonly name: string;
  /** URL used to download the asset. */
  readonly downloadUrl: string;
}

/** CommaAgents release metadata used for update discovery and installation. */
export interface ReleaseInfo {
  /** Release version without the leading `v`. */
  readonly version: string;
  /** Whether the release is a prerelease. */
  readonly prerelease: boolean;
  /** Browser URL for the release notes. */
  readonly pageUrl: string;
  /** Files published with the release. */
  readonly assets: readonly ReleaseAsset[];
}

/** Result of checking the installed CLI against compatible releases. */
export type UpdateCheckResult =
  | {
      readonly status: "available";
      readonly currentVersion: string;
      readonly release: ReleaseInfo;
    }
  | {
      readonly status: "up-to-date";
      readonly currentVersion: string;
      readonly latestVersion: string;
    }
  | {
      readonly status: "unavailable";
      readonly currentVersion: string;
      readonly reason: string;
    };

/** Options for checking whether a newer CLI release is available. */
export interface CheckForUpdateOptions {
  /** Installed CLI version. Defaults to the build-time version. */
  readonly currentVersion?: string;
  /** Maximum age of a cached release response. Use `0` to force a request. */
  readonly cacheMaxAgeMs?: number;
  /** Fetch implementation used for release discovery. */
  readonly fetchImplementation?: typeof fetch;
}

/** Options for the interactive or automated update command. */
export interface RunUpdateOptions {
  /** Skip interactive confirmation. @default false */
  readonly confirmed?: boolean;
  /** Report update availability without installing it. @default false */
  readonly checkOnly?: boolean;
}

/** Outcome of installing a CLI update. */
export interface UpdateResult {
  /** Version that was installed. */
  readonly version: string;
  /** Whether replacement completes after the current process exits. */
  readonly deferred: boolean;
}
