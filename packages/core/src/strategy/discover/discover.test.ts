// Tests for the `discoverStrategies()` helper.
//
// Uses a temp dir for cwd and dataDir so we don't depend on the host's
// real `.comma/` or `<dataDir>/`.

import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  discoverStrategies,
  resolveInstalledStrategyReference,
} from "./discover";

function createScratchDir(label: string): string {
  const dir = join(
    tmpdir(),
    `comma-discover-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

const TRIVIAL_STRATEGY = {
  name: "trivial-strategy",
  version: "1.0.0",
  description: "A trivial strategy.",
  agents: {
    talker: { type: "user" as const },
  },
  flow: {
    type: "sequential" as const,
    name: "main",
    steps: [{ agent: "talker" }],
  },
};

describe("discoverStrategies", () => {
  it("returns empty when cwd and dataDir have no strategies", async () => {
    const cwd = createScratchDir("empty-cwd");
    const dataDir = createScratchDir("empty-data");

    try {
      const result = await discoverStrategies({
        cwd,
        dataDir,
        includeBundled: false,
      });
      expect(result.strategies).toEqual([]);
      expect(result.warnings).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("discovers a single-file strategy under <cwd>/.comma/strategies/", async () => {
    const cwd = createScratchDir("cwd-single");
    const strategiesDir = join(cwd, ".comma", "strategies");
    mkdirSync(strategiesDir, { recursive: true });
    const strategyPath = join(strategiesDir, "trivial.json");
    writeFileSync(strategyPath, JSON.stringify(TRIVIAL_STRATEGY), "utf8");

    try {
      const result = await discoverStrategies({
        cwd,
        dataDir: createScratchDir("cwd-single-data"),
        includeBundled: false,
      });
      expect(result.warnings).toEqual([]);
      expect(result.strategies).toHaveLength(1);
      const [entry] = result.strategies;
      expect(entry?.name).toBe("trivial-strategy");
      expect(entry?.version).toBe("1.0.0");
      expect(entry?.description).toBe("A trivial strategy.");
      expect(entry?.path).toBe(strategyPath);
      expect(entry?.origin).toBe("cwd");
      expect(entry?.label).toBe("trivial-strategy");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("surfaces invalid strategy files as warnings without including them", async () => {
    const cwd = createScratchDir("cwd-invalid");
    const strategiesDir = join(cwd, ".comma", "strategies");
    mkdirSync(strategiesDir, { recursive: true });
    const badPath = join(strategiesDir, "broken.json");
    writeFileSync(badPath, '{"name":"oops"}', "utf8");

    try {
      const result = await discoverStrategies({
        cwd,
        dataDir: createScratchDir("cwd-invalid-data"),
        includeBundled: false,
      });
      expect(result.strategies).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.path).toBe(badPath);
      expect(result.warnings[0]?.reason).toMatch(/Schema invalid/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("expands project manifests into per-strategy entries with manifestPath", async () => {
    const cwd = createScratchDir("cwd-project");
    const projectDir = join(cwd, ".comma", "strategies", "my-project");
    mkdirSync(projectDir, { recursive: true });

    const strategyPath = join(projectDir, "trivial.json");
    writeFileSync(strategyPath, JSON.stringify(TRIVIAL_STRATEGY), "utf8");

    const manifestPath = join(projectDir, "comma-project.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        name: "@test/my-project",
        version: "1.0.0",
        strategies: {
          trivial: { path: "./trivial.json", expose: true },
        },
      }),
      "utf8",
    );

    try {
      const result = await discoverStrategies({
        cwd,
        dataDir: createScratchDir("cwd-project-data"),
        includeBundled: false,
      });
      expect(result.warnings).toEqual([]);
      expect(result.strategies).toHaveLength(1);
      const [entry] = result.strategies;
      expect(entry?.path).toBe(strategyPath);
      expect(entry?.manifestPath).toBe(manifestPath);
      expect(entry?.origin).toBe("cwd-project");
      expect(entry?.label).toBe("@test/my-project > trivial-strategy");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("discovers only exposed strategies from installed Hub packages", async () => {
    const cwd = createScratchDir("hub-cwd");
    const dataDir = createScratchDir("hub-data");
    const projectDir = join(dataDir, "packages", "@test", "hub-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "exposed.jsonc"),
      `// comment\n${JSON.stringify(TRIVIAL_STRATEGY)}`,
    );
    writeFileSync(
      join(projectDir, "internal.yaml"),
      [
        "name: internal-strategy",
        "version: 1.0.0",
        "agents:",
        "  user: { type: user }",
        "flow:",
        "  type: sequential",
        "  name: main",
        "  steps: [{ agent: user }]",
      ].join("\n"),
    );
    writeFileSync(
      join(projectDir, "comma-project.json"),
      JSON.stringify({
        name: "@test/hub-project",
        version: "1.0.0",
        strategies: {
          exposed: { path: "exposed.jsonc", expose: true },
          internal: { path: "internal.yaml", expose: false },
        },
      }),
    );

    try {
      const result = await discoverStrategies({
        cwd,
        dataDir,
        includeBundled: false,
      });
      expect(result.warnings).toEqual([]);
      expect(result.strategies).toHaveLength(1);
      expect(result.strategies[0]?.origin).toBe("hub-package");
      expect(result.strategies[0]?.name).toBe("trivial-strategy");

      const internal = await resolveInstalledStrategyReference(
        "@test/hub-project/strategies/internal",
        dataDir,
      );
      expect(internal?.name).toBe("internal-strategy");
      expect(internal?.manifestPath).toBe(
        join(projectDir, "comma-project.json"),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("includes the official bundled strategies by default", async () => {
    const cwd = createScratchDir("bundled-cwd");
    const dataDir = createScratchDir("bundled-data");

    try {
      const result = await discoverStrategies({ cwd, dataDir });
      const bundled = result.strategies.filter(
        (strategy) => strategy.origin === "bundled",
      );
      expect(bundled.map((strategy) => strategy.name)).toContain("Build");
      expect(bundled.map((strategy) => strategy.name)).toContain("Plan");
      expect(bundled.map((strategy) => strategy.name)).toContain("QA");
      expect(
        bundled.some((strategy) =>
          strategy.path.endsWith("standardize/worker.jsonc"),
        ),
      ).toBe(false);

      const internal = await resolveInstalledStrategyReference(
        "@comma/core-strategies/strategies/standardize-worker",
        dataDir,
      );
      expect(internal?.origin).toBe("bundled");
      expect(internal?.path).toEndWith("standardize/worker.jsonc");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
