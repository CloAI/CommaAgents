import { describe, expect, it } from "bun:test";

import {
  buildPackageUpdateCommand,
  resolveCliInstallation,
} from "../installation";
import {
  compareVersions,
  normalizeReleases,
  resolveExpectedChecksum,
  resolveStandaloneAssetName,
  selectLatestRelease,
} from "./update.utils";

describe("update utilities", () => {
  it("should compare stable and prerelease versions", () => {
    expect(compareVersions("2.0.0-rc.2", "2.0.0-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "2.0.0-rc.2")).toBeGreaterThan(0);
    expect(compareVersions("2.1.0", "2.0.9")).toBeGreaterThan(0);
  });

  it("should keep stable installations on stable releases", () => {
    const releases = normalizeReleases([
      {
        tag_name: "v2.1.0-rc.1",
        html_url: "https://example.com/rc",
        draft: false,
        prerelease: true,
        assets: [],
      },
      {
        tag_name: "v2.0.1",
        html_url: "https://example.com/stable",
        draft: false,
        prerelease: false,
        assets: [],
      },
    ]);

    expect(selectLatestRelease(releases, "2.0.0")?.version).toBe("2.0.1");
    expect(selectLatestRelease(releases, "2.0.0-rc.1")?.version).toBe(
      "2.1.0-rc.1",
    );
  });

  it("should resolve release assets and checksums", () => {
    expect(
      resolveStandaloneAssetName({
        platform: "linux",
        architecture: "x64",
        musl: true,
      }),
    ).toBe("comma-linux-x64-musl.tar.gz");
    expect(
      resolveStandaloneAssetName({
        platform: "win32",
        architecture: "arm64",
      }),
    ).toBe("comma-windows-arm64.zip");
    expect(
      resolveExpectedChecksum(
        `${"a".repeat(64)}  comma-linux-x64.tar.gz\n`,
        "comma-linux-x64.tar.gz",
      ),
    ).toBe("a".repeat(64));
  });

  it("should build the update command for the detected package manager", () => {
    const installation = resolveCliInstallation({
      standaloneBuild: false,
      executablePath: "/home/tester/.bun/bin/bun",
      cliEntrypoint:
        "/home/tester/.bun/install/global/node_modules/@comma-agents/cli/dist/comma.js",
    });
    expect(installation).toEqual({ type: "package", manager: "bun" });
    if (installation.type !== "package") throw new Error("Expected package");
    expect(
      buildPackageUpdateCommand(
        installation.manager,
        "2.0.0",
        "/home/tester/.bun/bin/bun",
      ),
    ).toEqual([
      "/home/tester/.bun/bin/bun",
      "add",
      "--global",
      "@comma-agents/cli@2.0.0",
    ]);
  });
});
