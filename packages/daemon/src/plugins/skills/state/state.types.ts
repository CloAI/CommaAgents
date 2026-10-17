import type { SkillRegistry } from "@comma-agents/core/skills";

/** @internal Registries retained while their root or child execution is active. */
export interface SkillsContext {
  readonly registries: Map<string, SkillRegistry>;
  disposed: boolean;
}
