import { homedir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";

import {
  getApplicationDataDirectory,
  getCatalogCachePath,
  getCredentialsPath,
  getGlobalSkillsDirectory,
  getProjectDirectory,
  getProjectMcpConfigPath,
  getProviderInstallDirectory,
  resetCoreLocationOverrides,
  setApplicationDataDirectory,
  setCatalogCachePath,
  setCredentialsPath,
  setGlobalSkillsDirectory,
  setProviderInstallDirectory,
} from "./defaults";

afterEach(resetCoreLocationOverrides);

describe("Core locations", () => {
  it("derives Core-owned data paths from the application data directory", () => {
    setApplicationDataDirectory("/tmp/comma");

    expect(getApplicationDataDirectory()).toBe("/tmp/comma");
    expect(getCredentialsPath()).toBe("/tmp/comma/credentials.json");
    expect(getProviderInstallDirectory()).toBe("/tmp/comma/providers");
    expect(getCatalogCachePath()).toBe("/tmp/comma/cache/models-catalog.json");
    expect(getGlobalSkillsDirectory()).toBe(
      join(homedir(), ".config", "comma", "skills"),
    );
  });

  it("uses explicit location setters ahead of derived defaults", () => {
    setApplicationDataDirectory("/tmp/comma");
    setCredentialsPath("/tmp/credentials.json");
    setProviderInstallDirectory("/tmp/providers");
    setCatalogCachePath("/tmp/catalog.json");
    setGlobalSkillsDirectory("/tmp/skills");

    expect(getCredentialsPath()).toBe("/tmp/credentials.json");
    expect(getProviderInstallDirectory()).toBe("/tmp/providers");
    expect(getCatalogCachePath()).toBe("/tmp/catalog.json");
    expect(getGlobalSkillsDirectory()).toBe("/tmp/skills");
  });

  it("uses the project directory definition for workspace locations", () => {
    expect(getProjectDirectory("/workspace")).toBe(
      join("/workspace", ".comma"),
    );
    expect(getProjectMcpConfigPath("/workspace")).toBe(
      join("/workspace", ".comma", "mcp.json"),
    );
  });
});
