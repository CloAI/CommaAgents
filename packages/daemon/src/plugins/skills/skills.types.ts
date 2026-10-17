import type { Skill } from "@comma-agents/core/skills";
import type { Plugin } from "../../daemon-plugin";
import type { RunsPlugin } from "../runs";

/** Dependencies used to supply skills to prepared strategies. */
export interface CreateSkillsPluginOptions {
  /** Feature services supplied by the daemon. */
  readonly dependencies: {
    /** Register skill discovery before each strategy loads. */
    readonly runs: RunsPlugin;
  };
}

/** Skills available to each prepared root or child execution. */
export interface SkillsPlugin extends Plugin<"skills"> {
  /** List this execution's loaded skills, sorted by name. Returns an empty list after cleanup or for unknown runs. */
  listSkills(runId: string): readonly Skill[];
}
