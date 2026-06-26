import { readdirSync } from "node:fs";

import type { ReleaseInfo } from "./update.types";

interface ParsedVersion {
  readonly core: readonly [number, number, number];
  readonly prerelease: readonly string[];
}

interface GitHubReleaseAsset {
  readonly name: string;
  readonly browser_download_url: string;
}

interface GitHubRelease {
  readonly tag_name: string;
  readonly html_url: string;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly assets: readonly GitHubReleaseAsset[];
}

/** Parse a semantic version used by CommaAgents releases. */
function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(
    version,
  );
  if (match === null) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

/** Compare semantic versions, returning a positive number when `left` is newer. */
export function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersion(left);
  const rightVersion = parseVersion(right);
  if (leftVersion === undefined || rightVersion === undefined) {
    throw new Error(`Cannot compare invalid versions: ${left} and ${right}`);
  }

  for (let index = 0; index < leftVersion.core.length; index += 1) {
    const difference = leftVersion.core[index]! - rightVersion.core[index]!;
    if (difference !== 0) return difference;
  }

  if (
    leftVersion.prerelease.length === 0 ||
    rightVersion.prerelease.length === 0
  ) {
    if (leftVersion.prerelease.length === rightVersion.prerelease.length) {
      return 0;
    }
    return leftVersion.prerelease.length === 0 ? 1 : -1;
  }

  const identifierCount = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length,
  );
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier);
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier.localeCompare(rightIdentifier);
  }
  return 0;
}

/** Convert GitHub's release response into the release contract used by the updater. */
export function normalizeReleases(value: unknown): readonly ReleaseInfo[] {
  if (!Array.isArray(value)) {
    throw new Error("GitHub returned an invalid releases response");
  }

  return value.flatMap((entry): readonly ReleaseInfo[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const release = entry as Partial<GitHubRelease>;
    const version = release.tag_name?.replace(/^v/, "");
    if (
      release.draft !== false ||
      typeof version !== "string" ||
      parseVersion(version) === undefined ||
      typeof release.prerelease !== "boolean" ||
      typeof release.html_url !== "string" ||
      !Array.isArray(release.assets)
    ) {
      return [];
    }

    const assets = release.assets.flatMap(
      (
        asset,
      ): readonly {
        name: string;
        downloadUrl: string;
      }[] => {
        if (
          typeof asset?.name !== "string" ||
          typeof asset.browser_download_url !== "string"
        ) {
          return [];
        }
        return [
          {
            name: asset.name,
            downloadUrl: asset.browser_download_url,
          },
        ];
      },
    );
    return [
      {
        version,
        prerelease: release.prerelease,
        pageUrl: release.html_url,
        assets,
      },
    ];
  });
}

/** Select the newest release allowed by the installed version's release channel. */
export function selectLatestRelease(
  releases: readonly ReleaseInfo[],
  currentVersion: string,
): ReleaseInfo | undefined {
  const current = parseVersion(currentVersion);
  if (current === undefined) return undefined;
  const includePrereleases = current.prerelease.length > 0;

  return releases
    .filter((release) => includePrereleases || !release.prerelease)
    .sort((left, right) => compareVersions(right.version, left.version))[0];
}

/** Resolve the standalone release asset name for a platform and architecture. */
export function resolveStandaloneAssetName({
  platform = process.platform,
  architecture = process.arch,
  musl = detectMusl(),
}: {
  readonly platform?: NodeJS.Platform;
  readonly architecture?: string;
  readonly musl?: boolean;
} = {}): string {
  const operatingSystem =
    platform === "darwin"
      ? "darwin"
      : platform === "linux"
        ? "linux"
        : platform === "win32"
          ? "windows"
          : undefined;
  if (operatingSystem === undefined) {
    throw new Error(`Unsupported update platform: ${platform}`);
  }

  const assetArchitecture =
    architecture === "arm64"
      ? "arm64"
      : architecture === "x64"
        ? "x64"
        : undefined;
  if (assetArchitecture === undefined) {
    throw new Error(`Unsupported update architecture: ${architecture}`);
  }

  const libcSuffix = operatingSystem === "linux" && musl ? "-musl" : "";
  const extension = operatingSystem === "windows" ? "zip" : "tar.gz";
  return `comma-${operatingSystem}-${assetArchitecture}${libcSuffix}.${extension}`;
}

/** Extract an asset's SHA-256 digest from the release checksum manifest. */
export function resolveExpectedChecksum(
  checksumManifest: string,
  assetName: string,
): string | undefined {
  for (const line of checksumManifest.split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match?.[2] === assetName) return match[1]?.toLowerCase();
  }
  return undefined;
}

function detectMusl(): boolean {
  if (process.platform !== "linux") return false;
  for (const directory of ["/lib", "/usr/lib"]) {
    try {
      if (
        readdirSync(directory).some((entry) =>
          /^ld-musl-.*\.so\.1$/.test(entry),
        )
      ) {
        return true;
      }
    } catch {}
  }
  return false;
}
