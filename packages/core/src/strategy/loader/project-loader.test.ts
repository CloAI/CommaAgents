import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StrategyValidationError } from "../../errors";
import { loadProject } from "./project-loader";

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), "comma-project-"));
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

describe("loadProject", () => {
  it("throws when the manifest is missing", async () => {
    await expect(loadProject(join(projectDir, "missing.json"))).rejects.toThrow(
      "Project manifest not found",
    );
  });

  it("wraps invalid JSON in StrategyValidationError", async () => {
    const path = await writeManifest("{ invalid");

    await expect(loadProject(path)).rejects.toBeInstanceOf(
      StrategyValidationError,
    );
    await expect(loadProject(path)).rejects.toThrow(
      "Failed to parse comma-project.json",
    );
  });

  it("reports manifest schema validation issues", async () => {
    const path = await writeManifest({ name: "", strategies: [] });

    await expect(loadProject(path)).rejects.toThrow(
      "Project manifest validation failed",
    );
  });

  it("loads metadata and imports the default entry when present", async () => {
    await writeFile(
      join(projectDir, "index.ts"),
      '(globalThis as Record<string, unknown>).__commaProjectEntry = "loaded";',
    );
    const path = await writeManifest({
      name: "Example",
      version: "1.2.3",
      description: "Project description",
      strategies: ["strategy.json"],
    });

    const project = await loadProject(path);

    expect(project.name).toBe("Example");
    expect(project.version).toBe("1.2.3");
    expect(project.description).toBe("Project description");
    expect(project.manifestDir).toBe(projectDir);
    expect((globalThis as Record<string, unknown>).__commaProjectEntry).toBe(
      "loaded",
    );
  });

  it("does not require a default entry file", async () => {
    const path = await writeManifest({
      name: "No Entry",
      strategies: ["strategy.json"],
    });

    expect((await loadProject(path)).name).toBe("No Entry");
  });

  it("wraps a failing default entry import", async () => {
    await writeFile(
      join(projectDir, "index.ts"),
      "throw new Error('default boom')",
    );
    const path = await writeManifest({
      name: "Broken Default Entry",
      strategies: ["strategy.json"],
    });

    await expect(loadProject(path)).rejects.toThrow(
      `Failed to import "${join(projectDir, "index.ts")}"`,
    );
  });

  it("imports explicit entry, tool, agent, and flow files", async () => {
    await writeFile(
      join(projectDir, "entry.ts"),
      '(globalThis as Record<string, unknown>).__commaProjectEntry = "explicit";',
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
    const path = await writeManifest({
      name: "Imports",
      strategies: ["strategy.json"],
      entry: "entry.ts",
      tools: ["tool.ts"],
      agents: ["agent.ts"],
      flows: ["flow.ts"],
    });

    await loadProject(path);

    expect((globalThis as Record<string, unknown>).__commaProjectEntry).toBe(
      "explicit",
    );
    expect((globalThis as Record<string, unknown>).__commaProjectTool).toBe(
      "loaded",
    );
    expect((globalThis as Record<string, unknown>).__commaProjectAgent).toBe(
      "loaded",
    );
    expect((globalThis as Record<string, unknown>).__commaProjectFlow).toBe(
      "loaded",
    );
  });

  it("throws when an explicit entry, tool, agent, or flow file is missing", async () => {
    const missingEntry = await writeManifest({
      name: "Missing Entry",
      strategies: ["strategy.json"],
      entry: "missing.ts",
    });
    await expect(loadProject(missingEntry)).rejects.toThrow(
      "Entry file not found",
    );

    const missingTool = await writeManifest({
      name: "Missing Tool",
      strategies: ["strategy.json"],
      tools: ["missing.ts"],
    });
    await expect(loadProject(missingTool)).rejects.toThrow(
      "Tool file not found",
    );

    const missingAgent = await writeManifest({
      name: "Missing Agent",
      strategies: ["strategy.json"],
      agents: ["missing.ts"],
    });
    await expect(loadProject(missingAgent)).rejects.toThrow(
      "Agent file not found",
    );

    const missingFlow = await writeManifest({
      name: "Missing Flow",
      strategies: ["strategy.json"],
      flows: ["missing.ts"],
    });
    await expect(loadProject(missingFlow)).rejects.toThrow(
      "Flow file not found",
    );
  });

  it("wraps entry, tool, agent, and flow import failures", async () => {
    await writeFile(
      join(projectDir, "broken-entry.ts"),
      "throw new Error('entry boom')",
    );
    const brokenEntry = await writeManifest({
      name: "Broken Entry",
      strategies: ["strategy.json"],
      entry: "broken-entry.ts",
    });
    await expect(loadProject(brokenEntry)).rejects.toThrow(
      "Failed to import Entry file",
    );

    await writeFile(
      join(projectDir, "broken-tool.ts"),
      "throw new Error('tool boom')",
    );
    const brokenTool = await writeManifest({
      name: "Broken Tool",
      strategies: ["strategy.json"],
      tools: ["broken-tool.ts"],
    });
    await expect(loadProject(brokenTool)).rejects.toThrow(
      "Failed to import Tool file",
    );

    await writeFile(
      join(projectDir, "broken-agent.ts"),
      "throw new Error('agent boom')",
    );
    const brokenAgent = await writeManifest({
      name: "Broken Agent",
      strategies: ["strategy.json"],
      agents: ["broken-agent.ts"],
    });
    await expect(loadProject(brokenAgent)).rejects.toThrow(
      "Failed to import Agent file",
    );

    await writeFile(
      join(projectDir, "broken-flow.ts"),
      "throw new Error('flow boom')",
    );
    const brokenFlow = await writeManifest({
      name: "Broken Flow",
      strategies: ["strategy.json"],
      flows: ["broken-flow.ts"],
    });
    await expect(loadProject(brokenFlow)).rejects.toThrow(
      "Failed to import Flow file",
    );
  });
});
