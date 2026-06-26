/** Package manifest fields used to validate public release metadata. */
export interface ReleasePackageManifest {
  /** Published package name. */
  readonly name: string;
  /** Exact package version. */
  readonly version: string;
  /** Runtime dependency versions. */
  readonly dependencies?: Readonly<Record<string, string>>;
  /** Development dependency versions. */
  readonly devDependencies?: Readonly<Record<string, string>>;
  /** Peer dependency versions. */
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

/** Manifest contents paired with the path used in validation errors. */
export interface ReleaseManifestEntry {
  /** Repository-relative or absolute manifest path. */
  readonly path: string;
  /** Raw JSON manifest contents. */
  readonly contents: string;
}
