import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PUBLIC_PACKAGE_DIRECTORIES } from "./release-version.constants";
import type { ReleaseManifestEntry } from "./release-version.types";
import {
  collectReleaseManifestErrors,
  parseReleaseTag,
  synchronizeReleaseManifest,
} from "./release-version.utils";

const repositoryRoot = resolve(import.meta.dir, "..");

/** Run a command and fail with its exit status when it does not succeed. */
function runCommand(
  command: string,
  commandArguments: ReadonlyArray<string>,
  workingDirectory = repositoryRoot,
): void {
  const commandResult = Bun.spawnSync([command, ...commandArguments], {
    cwd: workingDirectory,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (commandResult.exitCode !== 0) {
    throw new Error(
      `${command} ${commandArguments.join(" ")} failed with exit code ${commandResult.exitCode}`,
    );
  }
}

/** Run Git and return its trimmed standard output. */
function readGit(commandArguments: ReadonlyArray<string>): string {
  const commandResult = Bun.spawnSync(["git", ...commandArguments], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (commandResult.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(commandResult.stderr).trim());
  }

  return new TextDecoder().decode(commandResult.stdout).trim();
}

/** Return the public package manifest paths used by release tooling. */
function getPublicManifestPaths(): ReadonlyArray<string> {
  return PUBLIC_PACKAGE_DIRECTORIES.map(
    (packageDirectory) => `packages/${packageDirectory}/package.json`,
  );
}

/** Synchronize all release manifests before creating a version commit. */
function synchronizeReleaseVersion(requestedVersion?: string): void {
  const rootManifestPath = join(repositoryRoot, "package.json");
  const rootManifestContents = readFileSync(rootManifestPath, "utf8");
  const rootManifest = JSON.parse(rootManifestContents) as {
    readonly version?: unknown;
  };
  const version = requestedVersion ?? rootManifest.version;
  if (typeof version !== "string") {
    throw new Error("A release version is required");
  }
  parseReleaseTag(`v${version}`);

  for (const relativeManifestPath of [
    "package.json",
    ...getPublicManifestPaths(),
  ]) {
    const manifestPath = join(repositoryRoot, relativeManifestPath);
    const contents = readFileSync(manifestPath, "utf8");
    const synchronizedContents = synchronizeReleaseManifest(
      contents,
      relativeManifestPath,
      version,
    );
    if (synchronizedContents !== contents) {
      writeFileSync(manifestPath, synchronizedContents);
    }
  }

  console.log(`Synchronized public packages at ${version}.`);
}

/** Read a manifest from a tagged commit without changing the current checkout. */
function readTaggedManifest(
  commit: string,
  manifestPath: string,
): ReleaseManifestEntry {
  return {
    path: manifestPath,
    contents: readGit(["show", `${commit}:${manifestPath}`]),
  };
}

/** Validate metadata and build the exact commit referenced by a release tag. */
function checkReleaseTag(tag: string): void {
  const expectedVersion = parseReleaseTag(tag);
  const commit = readGit(["rev-parse", `${tag}^{commit}`]);
  const manifestPaths = getPublicManifestPaths();
  const errors = collectReleaseManifestErrors(
    readTaggedManifest(commit, "package.json"),
    manifestPaths.map((manifestPath) =>
      readTaggedManifest(commit, manifestPath),
    ),
    expectedVersion,
  );
  if (errors.length > 0) {
    throw new Error(`Release tag validation failed:\n- ${errors.join("\n- ")}`);
  }

  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "comma-agents-release-"),
  );
  let worktreeAdded = false;
  try {
    runCommand("git", [
      "worktree",
      "add",
      "--detach",
      temporaryDirectory,
      commit,
    ]);
    worktreeAdded = true;
    runCommand("bun", ["install", "--frozen-lockfile"], temporaryDirectory);
    runCommand("bun", ["run", "packages:build"], temporaryDirectory);
    runCommand("bun", ["run", "packages:validate"], temporaryDirectory);
  } finally {
    if (worktreeAdded) {
      runCommand("git", ["worktree", "remove", "--force", temporaryDirectory]);
    }
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(`Validated ${tag} at ${commit}.`);
}

const [command, commandArgument] = process.argv.slice(2);

switch (command) {
  case "sync":
    synchronizeReleaseVersion(commandArgument);
    break;
  case "check-tag":
    if (commandArgument === undefined) {
      throw new Error("Usage: release-version.ts check-tag <tag>");
    }
    checkReleaseTag(commandArgument);
    break;
  default:
    throw new Error(
      "Usage: release-version.ts <sync [version] | check-tag <tag>>",
    );
}
