import Fuse from "fuse.js";
import { SkillSearchArgumentsSchema } from "./skills.schemas";
import { summarizeSkill } from "./skills.utils";
import type {
  SkillRegistry,
  SkillSearchOptions,
  SkillSearchResult,
} from "./skills.types";

/** Search a snapshot's names and descriptions without loading instructions into the model.
 * @param {SkillRegistry} registry - Registry to inspect.
 * @param {SkillSearchOptions} options - Plain-text query and optional result limit.
 * @returns {SkillSearchResult} Ranked metadata and number of matching entries before limiting.
 */
export function searchSkills(
  registry: SkillRegistry,
  options: SkillSearchOptions,
): SkillSearchResult {
  const { query, limit } = SkillSearchArgumentsSchema.parse(options);
  const index = new Fuse(registry.list().map(summarizeSkill), {
    keys: [
      { name: "name", weight: 2 },
      { name: "description", weight: 1 },
    ],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.4,
  });
  const matches = index
    .search(query)
    .map(({ item, score }) => ({ ...item, score: score ?? 1 }));
  matches.sort(
    (first, second) =>
      first.score - second.score || first.name.localeCompare(second.name),
  );
  return { matches: matches.slice(0, limit), totalMatches: matches.length };
}
