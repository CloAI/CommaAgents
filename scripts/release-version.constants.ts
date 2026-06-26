export const PUBLIC_PACKAGE_DIRECTORIES = [
  "core",
  "daemon",
  "tui",
  "cli",
] as const;

export const PUBLIC_PACKAGE_NAMES = new Set(
  PUBLIC_PACKAGE_DIRECTORIES.map(
    (packageDirectory) => `@comma-agents/${packageDirectory}`,
  ),
);

export const DEPENDENCY_GROUPS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
] as const;

export const RELEASE_TAG_PATTERN =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
