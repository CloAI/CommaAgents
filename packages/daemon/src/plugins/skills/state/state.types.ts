import type {
  LoadSkillsOptions,
  SkillRegistry,
  SkillLoadWarning,
} from "@comma-agents/core/skills";

/** @internal One preparation snapshot; warnings remain available for its lifetime. */
export interface RunSkillRegistry {
  readonly registry: SkillRegistry;
  readonly warnings: readonly SkillLoadWarning[];
}
/** @internal Discovery settings and preparation snapshots owned by a plugin. */
export interface SkillsContext {
  readonly registries: Map<string, RunSkillRegistry>;
  readonly discovery: LoadSkillsOptions;
  disposed: boolean;
}
