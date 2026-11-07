import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveCliInstallation } from "../installation";
import { removeSelectedData } from "./uninstall.utils";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createDataDirectory(): Promise<string> {
  const dataDirectory = await mkdtemp(join(tmpdir(), "comma-uninstall-"));
  temporaryDirectories.push(dataDirectory);
  for (const entry of [
    "runs",
    "packages",
    "hub",
    "providers",
    "cache",
    "strategies",
  ]) {
    await mkdir(join(dataDirectory, entry), { recursive: true });
    await writeFile(join(dataDirectory, entry, "entry.txt"), entry);
  }
  await writeFile(join(dataDirectory, "credentials.json"), "{}");
  return dataDirectory;
}

describe("resolveCliInstallation", () => {
  it("should resolve a standalone executable", () => {
    expect(
      resolveCliInstallation({
        standaloneBuild: true,
        executablePath: "/home/tester/.local/bin/comma",
        cliEntrypoint: undefined,
      }),
    ).toEqual({
      type: "standalone",
      executablePath: "/home/tester/.local/bin/comma",
    });
  });

  it("should resolve Bun and npm global packages", () => {
    expect(
      resolveCliInstallation({
        standaloneBuild: false,
        executablePath: "/home/tester/.bun/bin/bun",
        cliEntrypoint:
          "/home/tester/.bun/install/global/node_modules/@comma-agents/cli/dist/comma.js",
      }),
    ).toEqual({
      type: "package",
      manager: "bun",
    });
    expect(
      resolveCliInstallation({
        standaloneBuild: false,
        executablePath: "/home/tester/.bun/bin/bun",
        cliEntrypoint:
          "/usr/local/lib/node_modules/@comma-agents/cli/dist/comma.js",
      }),
    ).toEqual({
      type: "package",
      manager: "npm",
    });
  });

  it("should resolve the target of a global command symlink", async () => {
    const installationRoot = await mkdtemp(
      join(tmpdir(), "comma-installation-"),
    );
    temporaryDirectories.push(installationRoot);
    const packageEntrypoint = join(
      installationRoot,
      ".bun",
      "install",
      "global",
      "node_modules",
      "@comma-agents",
      "cli",
      "dist",
      "comma.js",
    );
    const commandPath = join(installationRoot, "bin", "comma");
    await mkdir(join(packageEntrypoint, ".."), { recursive: true });
    await mkdir(join(commandPath, ".."), { recursive: true });
    await writeFile(packageEntrypoint, "");
    await symlink(packageEntrypoint, commandPath);

    expect(
      resolveCliInstallation({
        standaloneBuild: false,
        executablePath: "/home/tester/.bun/bin/bun",
        cliEntrypoint: commandPath,
      }),
    ).toEqual({
      type: "package",
      manager: "bun",
    });
  });

  it("should not remove a development checkout", () => {
    expect(
      resolveCliInstallation({
        standaloneBuild: false,
        executablePath: "/home/tester/.bun/bin/bun",
        cliEntrypoint: "/workspace/packages/cli/src/main.ts",
      }),
    ).toEqual({
      type: "development",
      entrypoint: "/workspace/packages/cli/src/main.ts",
    });
  });
});

describe("removeSelectedData", () => {
  it("should remove only selected history and package data", async () => {
    const dataDirectory = await createDataDirectory();

    await removeSelectedData(dataDirectory, {
      removeHistory: true,
      removePackages: true,
      removeConfig: false,
    });

    expect(
      await existsSync(join(dataDirectory, "runs", "entry.txt")),
    ).toBe(false);
    expect(
      await existsSync(join(dataDirectory, "packages", "entry.txt")),
    ).toBe(false);
    expect(
      await existsSync(join(dataDirectory, "credentials.json")),
    ).toBe(true);
    expect(
      await readFile(join(dataDirectory, "strategies", "entry.txt"), "utf8"),
    ).toBe("strategies");
  });

  it("should remove config while preserving unselected history and packages", async () => {
    const dataDirectory = await createDataDirectory();

    await removeSelectedData(dataDirectory, {
      removeHistory: false,
      removePackages: false,
      removeConfig: true,
    });

    expect(
      await existsSync(join(dataDirectory, "runs", "entry.txt")),
    ).toBe(true);
    expect(
      await existsSync(join(dataDirectory, "packages", "entry.txt")),
    ).toBe(true);
    expect(
      await existsSync(join(dataDirectory, "credentials.json")),
    ).toBe(false);
    expect(
      await existsSync(join(dataDirectory, "strategies", "entry.txt")),
    ).toBe(false);
  });

  it("should remove the entire data directory when every category is selected", async () => {
    const dataDirectory = await createDataDirectory();

    await removeSelectedData(dataDirectory, {
      removeHistory: true,
      removePackages: true,
      removeConfig: true,
    });

    expect(await existsSync(dataDirectory)).toBe(false);
  });
});
