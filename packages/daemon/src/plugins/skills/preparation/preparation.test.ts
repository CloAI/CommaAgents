import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillsContext, disposeSkills, listSkillsForRun } from "../state";
import { prepareRunSkills } from "./preparation";

describe("staged skills activation", () => {
  it("should not restore a registry after plugin disposal or run cancellation", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "skills-staged-"));
    try {
      await mkdir(join(cwd, ".comma", "skills", "staged"), { recursive: true });
      await writeFile(
        join(cwd, ".comma", "skills", "staged", "SKILL.md"),
        "---\nname: staged\ndescription: Staged skill.\n---\nInstructions.",
      );
      for (const stop of ["dispose", "cancel"] as const) {
        const context = createSkillsContext({ globalSkillsDir: null });
        const controller = new AbortController();
        const prepared = await prepareRunSkills(context, {
          kind: "root",
          runId: "staged",
          cwd,
          strategyPath: "example.json",
          signal: controller.signal,
          staged: true,
        });
        expect(listSkillsForRun(context, "staged").available).toBe(false);
        if (stop === "dispose") {
          disposeSkills(context);
        } else {
          controller.abort();
        }
        prepared.activate?.();
        expect(listSkillsForRun(context, "staged")).toEqual({
          available: false,
          skills: [],
          warnings: [],
        });
        await prepared.dispose?.();
      }
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
