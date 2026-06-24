import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pack } from "tar-stream";
import { createHubManager } from "./hub";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createArchive(
  files: Readonly<Record<string, string>>,
): Promise<Uint8Array> {
  const archive = pack();
  const chunks: Buffer[] = [];
  archive.on("data", (chunk) => chunks.push(chunk));
  for (const [name, contents] of Object.entries(files)) {
    archive.entry({ name, type: "file" }, contents);
  }
  archive.finalize();
  await new Promise<void>((resolve, reject) => {
    archive.once("end", resolve);
    archive.once("error", reject);
  });
  return Bun.gzipSync(Buffer.concat(chunks));
}

describe("createHubManager", () => {
  it("discovers, installs, lists, and removes a declarative package", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "hub-manager-"));
    temporaryDirectories.push(dataDir);
    const manifest = {
      name: "@example/project",
      version: "1.0.0",
      strategies: { main: { path: "./strategies/main.json", expose: true } },
    };
    const registry = {
      version: 1,
      packages: [
        {
          name: manifest.name,
          version: manifest.version,
          path: "packages/@example/project",
          exports: { strategies: [], agents: [], flows: [], tools: [] },
        },
      ],
    };
    const archive = await createArchive({
      "CommaAgentsHub-sha/packages/@example/project/comma-project.json":
        JSON.stringify(manifest),
      "CommaAgentsHub-sha/packages/@example/project/strategies/main.json": "{}",
    });
    const fetch = async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url.includes("/commits/")) return Response.json({ sha: "sha" });
      if (url.endsWith("registry.json")) return Response.json(registry);
      return new Response(archive);
    };
    const manager = createHubManager({ dataDir, fetch });

    expect(await manager.listAvailable()).toHaveLength(1);
    const installed = await manager.install(manifest.name);
    expect(installed.version).toBe("1.0.0");
    expect(
      JSON.parse(
        await readFile(join(installed.path, "comma-project.json"), "utf8"),
      ),
    ).toEqual(manifest);
    expect(await manager.getInstalled(manifest.name)).toEqual(installed);
    expect(await manager.remove(manifest.name)).toBe(true);
    expect(await manager.listInstalled()).toEqual([]);
  });

  it("requires explicit approval for executable code", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "hub-manager-code-"));
    temporaryDirectories.push(dataDir);
    const registry = {
      version: 1,
      packages: [
        {
          name: "@example/code",
          version: "1.0.0",
          path: "packages/@example/code",
          exports: { strategies: [], agents: [], flows: [], tools: [] },
          permissions: { executesCode: true },
        },
      ],
    };
    const manifest = {
      name: "@example/code",
      version: "1.0.0",
      entry: "entry.ts",
      permissions: { executesCode: true },
    };
    const archive = await createArchive({
      "CommaAgentsHub-sha/packages/@example/code/comma-project.json":
        JSON.stringify(manifest),
      "CommaAgentsHub-sha/packages/@example/code/entry.ts": "export {};",
    });
    const manager = createHubManager({
      dataDir,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/commits/")) return Response.json({ sha: "sha" });
        if (url.endsWith("registry.json")) return Response.json(registry);
        return new Response(archive);
      },
    });
    await expect(manager.install("@example/code")).rejects.toThrow("allowCode");
    const installed = await manager.install("@example/code", {
      allowCode: true,
    });
    expect(
      await manager.isExecutableCodeApproved(
        join(installed.path, "comma-project.json"),
      ),
    ).toBe(true);
    const recreated = createHubManager({ dataDir, fetch: globalThis.fetch });
    expect(
      await recreated.isExecutableCodeApproved(
        join(installed.path, "comma-project.json"),
      ),
    ).toBe(true);
  });

  it("rejects unresolved dependencies and archive traversal", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "hub-manager-invalid-"));
    temporaryDirectories.push(dataDir);
    const registry = {
      version: 1,
      packages: [
        {
          name: "@example/invalid",
          version: "1.0.0",
          path: "packages/@example/invalid",
          exports: { strategies: [], agents: [], flows: [], tools: [] },
        },
      ],
    };
    let archive = await createArchive({
      "CommaAgentsHub-sha/packages/@example/invalid/comma-project.json":
        JSON.stringify({
          name: "@example/invalid",
          version: "1.0.0",
          dependencies: { "@example/missing": "1.0.0" },
        }),
    });
    const manager = createHubManager({
      dataDir,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/commits/")) return Response.json({ sha: "sha" });
        if (url.endsWith("registry.json")) return Response.json(registry);
        return new Response(archive);
      },
    });
    await expect(manager.install("@example/invalid")).rejects.toThrow(
      "dependencies are not supported",
    );

    archive = await createArchive({
      "CommaAgentsHub-sha/packages/@example/invalid/comma-project.json":
        JSON.stringify({
          name: "@example/invalid",
          version: "1.0.0",
        }),
      "CommaAgentsHub-sha/packages/@example/invalid/../../escape.txt": "escape",
    });
    await expect(manager.install("@example/invalid")).rejects.toThrow(
      "escapes package root",
    );
  });
});
