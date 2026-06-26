import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_USER_CONFIG } from "./useUserConfig.constants";
import {
  loadUserConfig,
  normalizeUserConfig,
  saveUserConfig,
} from "./useUserConfig.utils";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("user config utils", () => {
  it("normalizes valid themes and rejects malformed input", () => {
    expect(normalizeUserConfig({ themeName: "dracula" })).toEqual({
      themeName: "dracula",
    });
    expect(normalizeUserConfig({ themeName: "unknown" })).toEqual(
      DEFAULT_USER_CONFIG,
    );
    expect(normalizeUserConfig(null)).toEqual(DEFAULT_USER_CONFIG);
  });

  it("saves and reloads configuration from nested paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "comma-user-config-"));
    tempDirs.push(directory);
    const filePath = join(directory, "nested", "config.json");

    saveUserConfig(filePath, { themeName: "light" });

    expect(loadUserConfig(filePath)).toEqual({ themeName: "light" });
  });

  it("falls back for missing and corrupt files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "comma-user-config-"));
    tempDirs.push(directory);
    const missingPath = join(directory, "missing.json");
    const corruptPath = join(directory, "corrupt.json");
    await Bun.write(corruptPath, "{not-json");

    expect(loadUserConfig(missingPath)).toEqual(DEFAULT_USER_CONFIG);
    expect(loadUserConfig(corruptPath)).toEqual(DEFAULT_USER_CONFIG);
  });
});
