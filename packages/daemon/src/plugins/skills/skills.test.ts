import { RunOutcomeStatus } from "../runs/state/state.schemas";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as skillsModule from "@comma-agents/core/skills";
import type { SkillRegistry } from "@comma-agents/core/skills";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  repository,
} from "../runs/test.utils";
import { createSkillsPlugin } from "./skills";

const loaderMocks: Array<{ mockRestore(): void }> = [];

afterEach(() => {
  for (const loaderMock of loaderMocks.splice(0)) {
    loaderMock.mockRestore();
  }
  cleanupRunFixtures();
});

function fixture() {
  const registries = new Map<string, SkillRegistry>();
  const loader = fakeLoader({ loads: [], restored: [] });
  const runs = createMockRunsPlugin({
    repository: repository(),
    async loadStrategy(options) {
      const registry = options.strategyInputs.skillRegistry;
      if (!registry) {
        throw new Error("Skill registry was not supplied");
      }
      registries.set(options.runId, registry);
      return loader(options);
    },
  });
  const skills = createSkillsPlugin({ dependencies: { runs } });
  return { runs, skills, registries, cwd: directories.at(-1)! };
}

async function writeSkill(
  cwd: string,
  name: string,
  content: string,
): Promise<void> {
  const directory = join(cwd, ".comma", "skills", name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: Rules for ${name}.\n---\n\n${content}`,
  );
}

describe("skills plugin", () => {
  test("should discover project skills and supply the same registry to the strategy loader", async () => {
    const { runs, skills, registries, cwd } = fixture();
    await writeSkill(cwd, "project-checks", "Run the project checks.");
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const loaded = skills
      .listSkills("root")
      .find((skill) => skill.name === "project-checks");
    expect(loaded).toMatchObject({
      name: "project-checks",
      content: "Run the project checks.",
      origin: "project",
    });
    expect(registries.get("root")!.get("project-checks")).toBe(loaded);
    expect(skills.listSkills("unknown")).toEqual([]);
    expect(skills).not.toHaveProperty("notifications");
    await runs.dispose();
    expect(skills.listSkills("root")).toEqual([]);
    await skills.dispose();
  });

  test("should tolerate missing project directories and skip malformed skills", async () => {
    const { runs, skills, registries, cwd } = fixture();
    await runs.prepareRun({
      runId: "empty",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    expect(registries.has("empty")).toBe(true);
    await runs.stopRun("empty");
    await writeSkill(cwd, "valid-skill", "Valid instructions.");
    const invalidDirectory = join(cwd, ".comma", "skills", "invalid-skill");
    await mkdir(invalidDirectory, { recursive: true });
    await writeFile(join(invalidDirectory, "SKILL.md"), "Missing frontmatter.");
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const names = skills.listSkills("root").map((skill) => skill.name);
    expect(names).toContain("valid-skill");
    expect(names).not.toContain("invalid-skill");
    await runs.dispose();
    await skills.dispose();
  });

  test("should reload changed skills on continuation and release completed registries", async () => {
    const { runs, skills, registries, cwd } = fixture();
    await writeSkill(cwd, "project-checks", "First instructions.");
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    const first = registries.get("root")!;
    await runs.startRun("root", "first").completion;
    expect(skills.listSkills("root")).toEqual([]);
    await writeSkill(cwd, "project-checks", "Updated instructions.");
    await runs.prepareRun({ runId: "root" });
    expect(registries.get("root")).not.toBe(first);
    expect(
      skills.listSkills("root").find((skill) => skill.name === "project-checks")
        ?.content,
    ).toBe("Updated instructions.");
    expect(first.get("project-checks")?.content).toBe("First instructions.");
    await runs.dispose();
    await skills.dispose();
  });

  test("should prepare independent registries for children and clean them after execution", async () => {
    const { runs, skills, registries, cwd } = fixture();
    await writeSkill(cwd, "project-checks", "Shared workspace instructions.");
    let childId = "";
    runs.registerStrategyHooks({
      name: "inspect-child-skills",
      attach(strategyContext) {
        if (!strategyContext.parentRunId) {
          return;
        }
        childId = strategyContext.runId;
        expect(registries.get(childId)).not.toBe(registries.get("root"));
        expect(
          skills
            .listSkills(childId)
            .some((skill) => skill.name === "project-checks"),
        ).toBe(true);
        expect(
          skills
            .listSkills("root")
            .some((skill) => skill.name === "project-checks"),
        ).toBe(true);
      },
    });
    await runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    expect((await runs.startRun("root", "child").completion).status).toBe(
      RunOutcomeStatus.completed,
    );
    expect(childId).not.toBe("");
    expect(skills.listSkills(childId)).toEqual([]);
    expect(skills.listSkills("root")).toEqual([]);
    await skills.dispose();
  });

  test("should release registries if a later preparation provider fails", async () => {
    const { runs, skills, cwd } = fixture();
    await writeSkill(cwd, "project-checks", "Instructions.");
    runs.registerRunPreparation({
      name: "failure",
      prepare() {
        throw new Error("provider failed");
      },
    });
    await expect(
      runs.prepareRun({
        runId: "root",
        configuration: {
          strategyPath: "example.json",
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    expect(skills.listSkills("root")).toEqual([]);
    await runs.dispose();
    await skills.dispose();
  });

  test("should discard a registry if execution is cancelled while discovery is in progress", async () => {
    const { runs, skills, registries, cwd } = fixture();
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const loadSkills = skillsModule.loadSkills;
    loaderMocks.push(
      spyOn(skillsModule, "loadSkills").mockImplementation(
        async (workspaceRoot, options) => {
          entered.resolve();
          await gate.promise;
          return loadSkills(workspaceRoot, options);
        },
      ),
    );
    const preparation = runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    await entered.promise;
    const stopped = runs.stopRun("root");
    gate.resolve();
    expect(await preparation).toMatchObject({
      phase: "terminal",
      outcome: { status: "stopped" },
    });
    await stopped;
    expect(registries.has("root")).toBe(false);
    expect(skills.listSkills("root")).toEqual([]);
    await skills.dispose();
  });

  test("should prevent in-flight discovery from restoring state after plugin disposal", async () => {
    const { runs, skills, registries, cwd } = fixture();
    const entered = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const loadSkills = skillsModule.loadSkills;
    loaderMocks.push(
      spyOn(skillsModule, "loadSkills").mockImplementation(
        async (workspaceRoot, options) => {
          entered.resolve();
          await gate.promise;
          return loadSkills(workspaceRoot, options);
        },
      ),
    );
    const preparation = runs.prepareRun({
      runId: "root",
      configuration: {
        strategyPath: "example.json",
        cwd,
      },
    });
    await entered.promise;
    const disposal = skills.dispose();
    expect(skills.dispose()).toBe(disposal);
    await disposal;
    gate.resolve();
    await expect(preparation).rejects.toMatchObject({
      code: "PREPARATION_ERROR",
    });
    expect(registries.has("root")).toBe(false);
    expect(skills.listSkills("root")).toEqual([]);
    await expect(
      runs.prepareRun({
        runId: "later",
        configuration: {
          strategyPath: "example.json",
          cwd,
        },
      }),
    ).rejects.toMatchObject({ code: "PREPARATION_ERROR" });
    await runs.dispose();
  });
});
