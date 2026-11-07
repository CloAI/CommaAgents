import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { StrategyValidationError } from "../../errors";
import { loadProject } from "./project-loader";

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "comma-project-"));
  await writeFile(
    join(projectDir, "package.json"),
    JSON.stringify({ type: "module" }),
  );
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
  delete (globalThis as Record<string, unknown>).__commaProjectEntry;
  delete (globalThis as Record<string, unknown>).__commaProjectTool;
  delete (globalThis as Record<string, unknown>).__commaProjectAgent;
  delete (globalThis as Record<string, unknown>).__commaProjectFlow;
});

async function writeManifest(
  manifest: string | Record<string, unknown>,
): Promise<string> {
  const path = join(projectDir, "comma-project.json");
  await writeFile(
    path,
    typeof manifest === "string" ? manifest : JSON.stringify(manifest),
  );
  return path;
}

function manifest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { name: "@test/project", version: "1.0.0", ...overrides };
}

describe("loadProject", () => {
  it("reports missing, invalid JSON, and schema-invalid manifests", async () => {
    await expect(loadProject(join(projectDir, "missing.json"))).rejects.toThrow(
      "Project manifest not found",
    );

    const invalidJson = await writeManifest("{ invalid");
    await expect(loadProject(invalidJson)).rejects.toBeInstanceOf(
      StrategyValidationError,
    );
    await expect(loadProject(invalidJson)).rejects.toThrow(
      "Failed to parse comma-project.json",
    );

    const legacy = await writeManifest({
      name: "@test/project",
      version: "1.0.0",
      strategies: ["strategy.json"],
    });
    await expect(loadProject(legacy)).rejects.toThrow(
      "Project manifest validation failed",
    );
  });

  it("loads metadata without importing an implicit index.ts", async () => {
    await writeFile(
      join(projectDir, "index.ts"),
      '(globalThis as Record<string, unknown>).__commaProjectEntry = "implicit";',
    );
    const path = await writeManifest(
      manifest({ description: "Project description" }),
    );

    const project = await loadProject(path);

    expect(project.name).toBe("@test/project");
    expect(project.version).toBe("1.0.0");
    expect(project.description).toBe("Project description");
    expect(project.manifestDir).toBe(projectDir);
    expect(
      (globalThis as Record<string, unknown>).__commaProjectEntry,
    ).toBeUndefined();
  });

  it.each([".cts", ".cjs"])(
    "should reject CommonJS %s modules with conversion guidance",
    async (extension) => {
      await writeFile(
        join(projectDir, `entry${extension}`),
        "module.exports = {};",
      );
      const path = await writeManifest(
        manifest({
          entry: `entry${extension}`,
          permissions: { executesCode: true },
        }),
      );
      await expect(loadProject(path)).rejects.toThrow("must use ESM");
      await expect(loadProject(path)).rejects.toThrow(
        "Convert .cts and .cjs modules to ESM",
      );
    },
  );

  it.each([".ts", ".tsx", ".js", ".jsx"])(
    "should require the nearest package to declare ESM for %s modules",
    async (extension) => {
      await writeFile(
        join(projectDir, "package.json"),
        JSON.stringify({ type: "commonjs" }),
      );
      await writeFile(
        join(projectDir, `entry${extension}`),
        "export const value = 1;",
      );
      const path = await writeManifest(
        manifest({
          entry: `entry${extension}`,
          permissions: { executesCode: true },
        }),
      );
      await expect(loadProject(path)).rejects.toThrow(
        'set {"type":"module"} in the nearest package.json',
      );
    },
  );

  it("should use the nearest package boundary rather than an ESM ancestor", async () => {
    await mkdir(join(projectDir, "nested"));
    await writeFile(
      join(projectDir, "nested/package.json"),
      JSON.stringify({ type: "commonjs" }),
    );
    await writeFile(
      join(projectDir, "nested/entry.ts"),
      "export const value = 1;",
    );
    const path = await writeManifest(
      manifest({
        entry: "nested/entry.ts",
        permissions: { executesCode: true },
      }),
    );
    await expect(loadProject(path)).rejects.toThrow("must use ESM");
  });

  it("should reject TypeScript without a declared ESM package", async () => {
    await rm(join(projectDir, "package.json"));
    await writeFile(join(projectDir, "entry.ts"), "export const value = 1;");
    const path = await writeManifest(
      manifest({ entry: "entry.ts", permissions: { executesCode: true } }),
    );
    await expect(loadProject(path)).rejects.toThrow("must use ESM");
  });

  it.each([".mts", ".mjs"])(
    "should load explicit ESM %s modules without package metadata",
    async (extension) => {
      await rm(join(projectDir, "package.json"));
      await writeFile(
        join(projectDir, `entry${extension}`),
        'globalThis.__commaProjectEntry = "explicit ESM";',
      );
      const path = await writeManifest(
        manifest({
          entry: `entry${extension}`,
          permissions: { executesCode: true },
        }),
      );
      await loadProject(path);
      expect((globalThis as Record<string, unknown>).__commaProjectEntry).toBe(
        "explicit ESM",
      );
    },
  );

  it("imports explicit entry, tool, and flow modules but never declarative agents", async () => {
    await writeFile(
      join(projectDir, "entry.ts"),
      '(globalThis as Record<string, unknown>).__commaProjectEntry = "loaded";',
    );
    await writeFile(
      join(projectDir, "tool.ts"),
      '(globalThis as Record<string, unknown>).__commaProjectTool = "loaded";',
    );
    await writeFile(
      join(projectDir, "agent.ts"),
      '(globalThis as Record<string, unknown>).__commaProjectAgent = "loaded";',
    );
    await writeFile(
      join(projectDir, "flow.ts"),
      '(globalThis as Record<string, unknown>).__commaProjectFlow = "loaded";',
    );
    const path = await writeManifest(
      manifest({
        entry: "entry.ts",
        tools: { tool: { path: "tool.ts" } },
        agents: { agent: { path: "agent.ts" } },
        flows: { flow: { path: "flow.ts" } },
        permissions: { executesCode: true },
      }),
    );

    await loadProject(path);

    expect((globalThis as Record<string, unknown>).__commaProjectEntry).toBe(
      "loaded",
    );
    expect((globalThis as Record<string, unknown>).__commaProjectTool).toBe(
      "loaded",
    );
    expect((globalThis as Record<string, unknown>).__commaProjectFlow).toBe(
      "loaded",
    );
    expect(
      (globalThis as Record<string, unknown>).__commaProjectAgent,
    ).toBeUndefined();
  });

  it("rejects missing executable modules and wraps import failures", async () => {
    const missing = await writeManifest(
      manifest({
        tools: { missing: { path: "missing.ts" } },
        permissions: { executesCode: true },
      }),
    );
    await expect(loadProject(missing)).rejects.toThrow("Tool file not found");

    await writeFile(join(projectDir, "broken.ts"), "throw new Error('boom')");
    const broken = await writeManifest(
      manifest({ entry: "broken.ts", permissions: { executesCode: true } }),
    );
    await expect(loadProject(broken)).rejects.toThrow(
      "Failed to import Entry file",
    );
  });

  it("rejects absolute, escaping, and symlink-escaping executable paths", async () => {
    const outside = join(tmpdir(), `comma-outside-${crypto.randomUUID()}.ts`);
    await writeFile(outside, "export {};");
    try {
      const absolute = await writeManifest(
        manifest({ entry: outside, permissions: { executesCode: true } }),
      );
      await expect(loadProject(absolute)).rejects.toThrow(
        "must use a relative path",
      );

      const escaping = await writeManifest(
        manifest({
          entry: `../${outside.split("/").at(-1)}`,
          permissions: { executesCode: true },
        }),
      );
      await expect(loadProject(escaping)).rejects.toThrow(
        "escapes the project directory",
      );

      await symlink(outside, join(projectDir, "linked.ts"));
      const linked = await writeManifest(
        manifest({ entry: "linked.ts", permissions: { executesCode: true } }),
      );
      await expect(loadProject(linked)).rejects.toThrow(
        "escapes the project directory",
      );
    } finally {
      await rm(outside, { force: true });
    }
  });

  it("requires declared permissions for privileged built-in tools", async () => {
    await writeFile(
      join(projectDir, "strategy.json"),
      JSON.stringify({
        name: "privileged",
        version: "1.0.0",
        agents: {
          worker: {
            model: "test/model",
            tools: ["read_file", "run_command", "webfetch"],
          },
        },
        flow: {
          name: "main",
          type: "sequential",
          steps: [{ agent: "worker" }],
        },
      }),
    );
    const path = await writeManifest(
      manifest({
        strategies: { main: { path: "strategy.json", expose: true } },
      }),
    );
    await expect(loadProject(path)).rejects.toThrow("permissions.filesystem");

    await writeManifest(
      manifest({
        strategies: { main: { path: "strategy.json", expose: true } },
        permissions: { filesystem: true, shell: true, network: true },
      }),
    );
    expect((await loadProject(path)).name).toBe("@test/project");
  });
});

const builtCore = resolve(import.meta.dirname, "../../../dist/index.js");
const builtStrategy = resolve(
  import.meta.dirname,
  "../../../dist/strategy/index.js",
);

describe("published project modules", () => {
  it
    .skipIf(!existsSync(builtCore) || !existsSync(builtStrategy))
    .each([".mts", ".ts", ".tsx", ".jsx"])(
    "should transpile external %s modules and share the published host registry in native Node",
    async (extension) => {
      const coreUrl = pathToFileURL(builtCore).href;
      if (extension === ".mts") {
        await rm(join(projectDir, "package.json"));
      }
      const markerCode =
        extension === ".jsx"
          ? 'const Marker = { Loaded: "loaded" };'
          : 'export enum Marker { Loaded = "loaded" }';
      const jsxCode = [".tsx", ".jsx"].includes(extension)
        ? "const h = (name) => ({name}); globalThis.__commaNativeJsx = (<loaded/>).name;"
        : 'globalThis.__commaNativeJsx = "loaded";';
      await writeFile(
        join(projectDir, `entry${extension}`),
        `
/** @jsx h */
import {registerTool} from ${JSON.stringify(coreUrl)};
${markerCode}
${jsxCode}
globalThis.__commaNativeMarker = Marker.Loaded;
registerTool("native-node-project-proof", {description:"Proof",parameters:{},execute:async()=>({ok:true,output:"ok"})});
`,
      );
      const manifestPath = await writeManifest(
        manifest({
          entry: `entry${extension}`,
          permissions: { executesCode: true },
        }),
      );
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `
import assert from "node:assert/strict";
import {getRegisteredToolNames} from ${JSON.stringify(coreUrl)};
import {loadProject} from ${JSON.stringify(pathToFileURL(builtStrategy).href)};
await loadProject(${JSON.stringify(manifestPath)});
assert.equal(globalThis.__commaNativeMarker, "loaded");
assert.equal(globalThis.__commaNativeJsx, "loaded");
assert.ok(getRegisteredToolNames().includes("native-node-project-proof"));
console.log("native project registry shared");
`,
        ],
        { encoding: "utf8" },
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("native project registry shared");
    },
  );
});
