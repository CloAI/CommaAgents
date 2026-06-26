import {
  DEPENDENCY_GROUPS,
  PUBLIC_PACKAGE_NAMES,
  RELEASE_TAG_PATTERN,
} from "./release-version.constants";
import type {
  ReleaseManifestEntry,
  ReleasePackageManifest,
} from "./release-version.types";

/** Escape text before using it as a literal regular expression fragment. */
function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse and minimally validate a package manifest used by release tooling. */
export function parseReleaseManifest(
  contents: string,
  manifestPath: string,
): ReleasePackageManifest {
  const manifest = JSON.parse(contents) as Partial<ReleasePackageManifest>;
  if (
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string"
  ) {
    throw new Error(
      `${manifestPath} must contain string name and version fields`,
    );
  }

  return manifest as ReleasePackageManifest;
}

/** Extract the package version from a version tag such as v2.0.0-rc.2. */
export function parseReleaseTag(tag: string): string {
  const tagName = tag.replace(/^refs\/tags\//, "");
  const tagMatch = RELEASE_TAG_PATTERN.exec(tagName);
  if (tagMatch === null) {
    throw new Error(
      `Release tags must use the form v<semver>; received ${tagName}`,
    );
  }

  return tagName.slice(1);
}

/** Update a manifest version and its internal public-package dependency pins. */
export function synchronizeReleaseManifest(
  contents: string,
  manifestPath: string,
  version: string,
): string {
  parseReleaseManifest(contents, manifestPath);

  let synchronizedContents = contents.replace(
    /^(\s*"version"\s*:\s*)"[^"]*"/m,
    `$1"${version}"`,
  );

  for (const packageName of PUBLIC_PACKAGE_NAMES) {
    const dependencyPattern = new RegExp(
      `^(\\s*"${escapeRegularExpression(packageName)}"\\s*:\\s*)"[^"]*"`,
      "gm",
    );
    synchronizedContents = synchronizedContents.replace(
      dependencyPattern,
      `$1"${version}"`,
    );
  }

  const synchronizedManifest = parseReleaseManifest(
    synchronizedContents,
    manifestPath,
  );
  if (synchronizedManifest.version !== version) {
    throw new Error(`Could not update ${manifestPath} to ${version}`);
  }

  return synchronizedContents;
}

/** Report version and internal dependency drift across public package manifests. */
export function collectReleaseManifestErrors(
  rootManifestEntry: ReleaseManifestEntry,
  publicManifestEntries: ReadonlyArray<ReleaseManifestEntry>,
  expectedVersion?: string,
): ReadonlyArray<string> {
  const rootManifest = parseReleaseManifest(
    rootManifestEntry.contents,
    rootManifestEntry.path,
  );
  const releaseVersion = expectedVersion ?? rootManifest.version;
  const errors: Array<string> = [];

  if (rootManifest.version !== releaseVersion) {
    errors.push(
      `${rootManifestEntry.path} is ${rootManifest.version}; expected ${releaseVersion}`,
    );
  }

  for (const manifestEntry of publicManifestEntries) {
    const manifest = parseReleaseManifest(
      manifestEntry.contents,
      manifestEntry.path,
    );
    if (manifest.version !== releaseVersion) {
      errors.push(
        `${manifest.name} is ${manifest.version}; expected ${releaseVersion}`,
      );
    }

    for (const dependencyGroup of DEPENDENCY_GROUPS) {
      for (const [dependencyName, dependencyVersion] of Object.entries(
        manifest[dependencyGroup] ?? {},
      )) {
        if (dependencyVersion.startsWith("workspace:")) {
          errors.push(
            `${manifest.name} ${dependencyGroup}.${dependencyName} uses ${dependencyVersion}`,
          );
        } else if (
          PUBLIC_PACKAGE_NAMES.has(dependencyName) &&
          dependencyVersion !== releaseVersion
        ) {
          errors.push(
            `${manifest.name} ${dependencyGroup}.${dependencyName} pins ${dependencyVersion}; expected ${releaseVersion}`,
          );
        }
      }
    }
  }

  return errors;
}
