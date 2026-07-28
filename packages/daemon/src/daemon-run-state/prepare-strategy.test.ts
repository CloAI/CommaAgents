import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HubManager, InstalledHubPackage } from "@comma-agents/core/hub";

import { assertProjectCodeApproved } from "./prepare-strategy";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("assertProjectCodeApproved", () => {
  it("rejects unapproved executable code from an installed Hub package", async () => {
    const packagePath = await mkdtemp(join(tmpdir(), "hub-code-approval-"));
    temporaryDirectories.push(packagePath);
    const manifestPath = join(packagePath, "comma-project.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        name: "@test/code",
        version: "1.0.0",
        entry: "entry.ts",
        permissions: { executesCode: true },
      }),
    );
    const installed: InstalledHubPackage = {
      name: "@test/code",
      version: "1.0.0",
      commit: "sha",
      path: packagePath,
      executableCodeApproved: false,
    };
    const hubManager = {
      listInstalled: async () => [installed],
      isExecutableCodeApproved: async () => false,
    } as unknown as HubManager;

    await expect(
      assertProjectCodeApproved(manifestPath, hubManager),
    ).rejects.toThrow("not approved");
  });
});
