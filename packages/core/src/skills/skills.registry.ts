import type { Skill, SkillRegistry } from "./skills.types";

/**
 * Create an in-memory skill registry.
 *
 * Project skills always override global skills with the same name; the
 * registry enforces this regardless of registration order. Calling
 * `register` with a global skill whose name is already taken by a
 * project skill is a no-op.
 *
 * @example
 * ```ts
 * const registry = createSkillRegistry();
 * registry.register(projectSkill);
 * registry.register(globalSkill); // ignored if names collide
 * registry.get("ts-patterns");
 * ```
 */
export function createSkillRegistry(): SkillRegistry {
  const skillsByName = new Map<string, Skill>();

  const registry: SkillRegistry = {
    register(skill: Skill): void {
      const existing = skillsByName.get(skill.name);
      // Project always wins. Global registration only succeeds when there's
      // no entry yet or the existing entry is also global (allowing global
      // re-registration to replace itself).
      if (
        existing &&
        existing.origin === "project" &&
        skill.origin === "global"
      ) {
        return;
      }
      skillsByName.set(skill.name, skill);
    },
    get(name: string): Skill | undefined {
      return skillsByName.get(name);
    },
    list(): readonly Skill[] {
      return [...skillsByName.values()].sort((firstSkill, secondSkill) =>
        firstSkill.name.localeCompare(secondSkill.name),
      );
    },
    isEmpty(): boolean {
      return skillsByName.size === 0;
    },
  };

  return registry;
}
