import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { resolveDataDir } from "@comma-agents/core";
import { stopDaemon } from "@comma-agents/daemon";
import { render } from "ink";
import { createElement } from "react";

import {
  buildPackageUpdateCommand,
  resolveCliInstallation,
} from "../installation";
import { UpdatePromptApp } from "./UpdatePromptApp";
import {
  RELEASES_API_URL,
  UPDATE_CHECK_CACHE_DURATION_MS,
  UPDATE_CHECK_CACHE_FILE,
} from "./update.constants";
import type {
  CheckForUpdateOptions,
  ReleaseInfo,
  RunUpdateOptions,
  UpdateCheckResult,
  UpdateResult,
} from "./update.types";
import {
  compareVersions,
  normalizeReleases,
  resolveExpectedChecksum,
  resolveStandaloneAssetName,
  selectLatestRelease,
} from "./update.utils";

interface ReleaseCache {
  readonly checkedAt: number;
  readonly releases: readonly ReleaseInfo[];
}

function currentVersion(): string {
  return process.env.COMMA_BUILD_VERSION ?? "development";
}

async function readCachedReleases(
  maxAgeMs: number,
): Promise<readonly ReleaseInfo[] | undefined> {
  if (maxAgeMs <= 0) return undefined;
  try {
    const cache = JSON.parse(
      await readFile(join(resolveDataDir(), UPDATE_CHECK_CACHE_FILE), "utf8"),
    ) as Partial<ReleaseCache>;
    if (
      typeof cache.checkedAt !== "number" ||
      Date.now() - cache.checkedAt > maxAgeMs
    ) {
      return undefined;
    }
    return normalizeCachedReleases(cache.releases);
  } catch {
    return undefined;
  }
}

function normalizeCachedReleases(value: unknown): readonly ReleaseInfo[] {
  if (!Array.isArray(value)) throw new Error("Invalid update cache");
  return value.flatMap((release): readonly ReleaseInfo[] => {
    if (typeof release !== "object" || release === null) return [];
    const candidate = release as Partial<ReleaseInfo>;
    if (
      typeof candidate.version !== "string" ||
      typeof candidate.prerelease !== "boolean" ||
      typeof candidate.pageUrl !== "string" ||
      !Array.isArray(candidate.assets)
    ) {
      return [];
    }
    const assets = candidate.assets.filter(
      (asset) =>
        typeof asset?.name === "string" &&
        typeof asset.downloadUrl === "string",
    );
    return [{ ...candidate, assets } as ReleaseInfo];
  });
}

async function writeReleaseCache(
  releases: readonly ReleaseInfo[],
): Promise<void> {
  const dataDirectory = resolveDataDir();
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(
    join(dataDirectory, UPDATE_CHECK_CACHE_FILE),
    JSON.stringify({ checkedAt: Date.now(), releases }),
  );
}

async function fetchReleases(
  fetchImplementation: typeof fetch,
): Promise<readonly ReleaseInfo[]> {
  const response = await fetchImplementation(RELEASES_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "comma-agents-cli",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub release check failed: ${response.status} ${response.statusText}`,
    );
  }
  const releases = normalizeReleases(await response.json());
  try {
    await writeReleaseCache(releases);
  } catch {}
  return releases;
}

/**
 * Check GitHub releases for a newer compatible CommaAgents CLI version.
 *
 * @param options - Current version, cache duration, and optional fetch implementation.
 * @example
 * ```ts
 * const result = await checkForUpdate({ cacheMaxAgeMs: 0 });
 * ```
 */
export async function checkForUpdate({
  currentVersion: installedVersion = currentVersion(),
  cacheMaxAgeMs = 0,
  fetchImplementation = fetch,
}: CheckForUpdateOptions = {}): Promise<UpdateCheckResult> {
  if (installedVersion === "development") {
    return {
      status: "unavailable",
      currentVersion: installedVersion,
      reason: "Update checks are disabled for development builds",
    };
  }

  let releases = await readCachedReleases(cacheMaxAgeMs);
  releases ??= await fetchReleases(fetchImplementation);
  const latestRelease = selectLatestRelease(releases, installedVersion);
  if (latestRelease === undefined) {
    return {
      status: "unavailable",
      currentVersion: installedVersion,
      reason: "No compatible GitHub release was found",
    };
  }

  return compareVersions(latestRelease.version, installedVersion) > 0
    ? {
        status: "available",
        currentVersion: installedVersion,
        release: latestRelease,
      }
    : {
        status: "up-to-date",
        currentVersion: installedVersion,
        latestVersion: latestRelease.version,
      };
}

async function runCommand(command: readonly string[]): Promise<void> {
  const child = Bun.spawn([...command], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`Update command exited with status ${exitCode}`);
  }
}

async function downloadFile(
  url: string,
  path: string,
  fetchImplementation: typeof fetch,
): Promise<void> {
  const response = await fetchImplementation(url, {
    headers: { "User-Agent": "comma-agents-cli" },
  });
  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

async function extractArchive(
  archivePath: string,
  destination: string,
): Promise<void> {
  if (process.platform === "win32") {
    await runCommand([
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
      archivePath,
      destination,
    ]);
    return;
  }
  await runCommand(["tar", "-xzf", archivePath, "-C", destination]);
}

async function scheduleWindowsReplacement(
  executablePath: string,
  replacementPath: string,
): Promise<void> {
  const scriptPath = join(tmpdir(), `comma-update-${crypto.randomUUID()}.ps1`);
  await writeFile(
    scriptPath,
    `param([int]$ParentProcessId, [string]$Target, [string]$Replacement)
Wait-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
Move-Item -LiteralPath $Replacement -Destination $Target -Force
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
`,
  );
  const child = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-ParentProcessId",
      String(process.pid),
      "-Target",
      executablePath,
      "-Replacement",
      replacementPath,
    ],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    },
  );
  child.unref();
}

async function installStandaloneRelease(
  release: ReleaseInfo,
  fetchImplementation: typeof fetch,
): Promise<boolean> {
  const assetName = resolveStandaloneAssetName();
  const releaseAsset = release.assets.find((asset) => asset.name === assetName);
  const checksumAsset = release.assets.find(
    (asset) => asset.name === "SHA256SUMS",
  );
  if (releaseAsset === undefined || checksumAsset === undefined) {
    throw new Error(
      `Release v${release.version} does not include ${assetName}`,
    );
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "comma-update-"));
  const archivePath = join(temporaryDirectory, assetName);
  const checksumPath = join(temporaryDirectory, "SHA256SUMS");
  try {
    await Promise.all([
      downloadFile(releaseAsset.downloadUrl, archivePath, fetchImplementation),
      downloadFile(
        checksumAsset.downloadUrl,
        checksumPath,
        fetchImplementation,
      ),
    ]);
    const expectedChecksum = resolveExpectedChecksum(
      await readFile(checksumPath, "utf8"),
      assetName,
    );
    if (expectedChecksum === undefined) {
      throw new Error(`No checksum was published for ${assetName}`);
    }
    const actualChecksum = createHash("sha256")
      .update(await readFile(archivePath))
      .digest("hex");
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Checksum verification failed for ${assetName}`);
    }

    const extractionDirectory = join(temporaryDirectory, "extracted");
    await mkdir(extractionDirectory);
    await extractArchive(archivePath, extractionDirectory);
    const executableName = process.platform === "win32" ? "comma.exe" : "comma";
    const extractedExecutable = join(extractionDirectory, executableName);
    const executablePath = process.execPath;
    const replacementPath = join(
      dirname(executablePath),
      `.${basename(executablePath)}.update-${crypto.randomUUID()}`,
    );
    await copyFile(extractedExecutable, replacementPath);

    if (process.platform === "win32") {
      await scheduleWindowsReplacement(executablePath, replacementPath);
      return true;
    }

    await chmod(replacementPath, 0o755);
    await rename(replacementPath, executablePath);
    return false;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/**
 * Install an available CLI release using the current installation method.
 *
 * @param update - Available update returned by `checkForUpdate`.
 * @example
 * ```ts
 * const update = await checkForUpdate();
 * if (update.status === "available") await installUpdate(update);
 * ```
 */
export async function installUpdate(
  update: Extract<UpdateCheckResult, { status: "available" }>,
): Promise<UpdateResult> {
  const installation = resolveCliInstallation({
    standaloneBuild: process.env.COMMA_STANDALONE_BUILD === "1",
    executablePath: process.execPath,
    cliEntrypoint: process.argv[1],
  });
  if (installation.type === "development") {
    throw new Error("Cannot update a CLI running from a development checkout");
  }

  if (installation.type === "package") {
    await runCommand(
      buildPackageUpdateCommand(
        installation.manager,
        update.release.version,
        process.execPath,
      ),
    );
    await stopDaemon();
    return { version: update.release.version, deferred: false };
  }

  if (process.platform === "win32") await stopDaemon();
  const deferred = await installStandaloneRelease(update.release, fetch);
  if (!deferred) await stopDaemon();
  return { version: update.release.version, deferred };
}

/** Prompt for whether to install an available update. */
export async function promptForUpdate(
  update: Extract<UpdateCheckResult, { status: "available" }>,
): Promise<boolean> {
  let accepted = false;
  const app = render(
    createElement(UpdatePromptApp, {
      update,
      onDecision: (decision) => {
        accepted = decision;
      },
    }),
  );
  await app.waitUntilExit();
  return accepted;
}

/**
 * Check for and optionally install the newest CLI release.
 *
 * @param options - Confirmation and check-only behavior.
 * @example
 * ```ts
 * await runUpdater({ confirmed: true });
 * ```
 */
export async function runUpdater({
  confirmed = false,
  checkOnly = false,
}: RunUpdateOptions = {}): Promise<UpdateResult | undefined> {
  const update = await checkForUpdate({ cacheMaxAgeMs: 0 });
  if (update.status === "unavailable") {
    console.log(update.reason);
    return undefined;
  }
  if (update.status === "up-to-date") {
    console.log(`CommaAgents v${update.currentVersion} is up to date.`);
    return undefined;
  }

  if (checkOnly) {
    console.log(
      `CommaAgents v${update.release.version} is available (current: v${update.currentVersion}).`,
    );
    return undefined;
  }

  const accepted =
    confirmed ||
    (process.stdin.isTTY &&
      process.stdout.isTTY &&
      (await promptForUpdate(update)));
  if (!accepted) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("Non-interactive update requires --yes");
    }
    console.log("Update skipped.");
    return undefined;
  }

  const result = await installUpdate(update);
  console.log(
    result.deferred
      ? `CommaAgents v${result.version} will finish installing after this command exits.`
      : `Updated CommaAgents to v${result.version}.`,
  );
  return result;
}

/** Check for an update before launching the TUI and offer to install it. */
export async function offerUpdateBeforeTui(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  let update: UpdateCheckResult;
  try {
    update = await checkForUpdate({
      cacheMaxAgeMs: UPDATE_CHECK_CACHE_DURATION_MS,
    });
  } catch {
    return false;
  }
  if (update.status !== "available" || !(await promptForUpdate(update))) {
    return false;
  }

  const result = await installUpdate(update);
  console.log(
    result.deferred
      ? `CommaAgents v${result.version} will finish installing after this command exits. Run comma again to launch it.`
      : `Updated CommaAgents to v${result.version}. Run comma again to launch it.`,
  );
  return true;
}
