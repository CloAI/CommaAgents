import { z } from "zod";

import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { ListSkillsData } from "./list-skills.types";

export const listSkillsParams = z.object({});

export function createListSkillsTool(): ToolDefinition<
  typeof listSkillsParams,
  ListSkillsData
> {
  return defineTool<typeof listSkillsParams, ListSkillsData>({
    description: describeTool({
      purpose:
        "List all available skills and their descriptions. Use this to discover what skills are registered before loading one with load_skill. Skills are reusable instruction bundles (TypeScript conventions, React patterns, review checklists, etc.).",
      inputs: [
        {
          name: "(none)",
          type: "none",
          required: false,
          description: "This tool takes no parameters.",
        },
      ],
      outputs:
        "`{ skills, count }` where `skills` is an array of `{ name, description, origin, sourcePath }` entries sorted alphabetically.",
      errors: [
        {
          kind: "skill_unavailable",
          description:
            "The runtime has no skill registry configured. Stop attempting to use skills.",
        },
      ],
    }),
    parameters: listSkillsParams,
    execute: async (_validatedArguments, toolContext) => {
      const { skillRegistry } = toolContext;
      if (!skillRegistry) {
        return errorResult<ListSkillsData>(
          toolError(
            "skill_unavailable",
            "No skill registry is configured for this agent. Skills are unavailable.",
            { recoverable: false },
          ),
        );
      }

      const allSkills = skillRegistry.list();

      if (allSkills.length === 0) {
        const data: ListSkillsData = { skills: [], count: 0 };
        return okResult<ListSkillsData>("No skills are currently registered.", {
          data,
        });
      }

      const skills = allSkills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        origin: skill.origin,
        sourcePath: skill.sourcePath,
      }));

      const data: ListSkillsData = { skills, count: skills.length };

      const lines = [
        `${skills.length} skill(s) registered:`,
        "",
        ...skills.map((s) => `- ${s.name} (${s.origin}): ${s.description}`),
      ];

      return okResult<ListSkillsData>(lines.join("\n"), { data });
    },
  });
}
