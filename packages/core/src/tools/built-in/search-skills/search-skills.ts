import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import { searchSkills } from "../../../skills/skills.search";
import type { ToolDefinition } from "../../tool.types";
import type { SkillSearchResult } from "../../../skills/skills.types";
import { describeTool } from "../describe-tool";

export const searchSkillsParams = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(50).default(10),
});

/** Find relevant skill instructions by fuzzy name and description matching.
 * @returns {ToolDefinition} Search tool using the execution's existing registry snapshot.
 */
export function createSearchSkillsTool(): ToolDefinition<
  typeof searchSkillsParams,
  SkillSearchResult
> {
  return defineTool<typeof searchSkillsParams, SkillSearchResult>({
    description: describeTool({
      purpose:
        "Find relevant skills using a short query about your task. Matches names and descriptions with typo tolerance. Inspect the returned descriptions and choose whether to load a result with load_skill; search does not load its instructions.",
      inputs: [
        {
          name: "query",
          type: "string",
          required: true,
          description:
            "Task or skill keywords; plain text, not a regular expression.",
        },
        {
          name: "limit",
          type: "number",
          required: false,
          defaultValue: "10",
          description: "Maximum matches, from 1 through 50.",
        },
      ],
      outputs:
        "{ matches, totalMatches }. Each match contains name, description, sourcePath, origin, and score (lower is closer). An empty matches array is a successful search.",
      errors: [
        {
          kind: "skill_unavailable",
          description: "No skill registry is configured for this execution.",
        },
      ],
    }),
    parameters: searchSkillsParams,
    execute: async (options, context) => {
      if (!context.skillRegistry) {
        return errorResult(
          toolError(
            "skill_unavailable",
            "No skill registry is configured for this agent.",
            { recoverable: false },
          ),
        );
      }
      const result = searchSkills(context.skillRegistry, options);
      return okResult(
        result.matches.length
          ? result.matches
              .map((skill) => `${skill.name}: ${skill.description}`)
              .join("\n")
          : "No matching skills found.",
        { data: result },
      );
    },
  });
}
