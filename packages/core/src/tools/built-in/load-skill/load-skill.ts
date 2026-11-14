import { z } from "zod";

import { defineTool } from "../../define/define-tool";
import { errorResult, okResult, toolError } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import { describeTool } from "../describe-tool";
import type { LoadSkillData } from "./load-skill.types";

export const loadSkillParams = z.object({
  name: z
    .string()
    .min(1)
    .describe(
      "Name of the skill to load. Use the exact name supplied by search_skills, list_skills, or the user.",
    ),
});

/**
 * Create the `load_skill` tool.
 *
 * Reads from `ToolContext.skillRegistry`. When no registry is configured
 * — for example, because the strategy loader found no skills directories
 * — every call returns `skill_unavailable` with a helpful message rather
 * than `not_found`, so the LLM can stop trying.
 *
 * @example
 * ```ts
 * const loadSkill = createLoadSkillTool();
 * ```
 */
export function createLoadSkillTool(): ToolDefinition<
  typeof loadSkillParams,
  LoadSkillData
> {
  return defineTool<typeof loadSkillParams, LoadSkillData>({
    description: describeTool({
      purpose:
        "Load the full instructions of a named skill. Skills are reusable instruction bundles (TypeScript conventions, React patterns, review checklists, etc.) discoverable through search_skills and list_skills. Load a skill before doing related work so you follow its conventions; do not load skills speculatively.",
      inputs: [
        {
          name: "name",
          type: "string",
          required: true,
          description: "Exact skill name from a discovery result or the user.",
        },
      ],
      outputs:
        "`{ name, description, content, sourcePath, origin }`. `content` is the full markdown body of the skill's SKILL.md.",
      errors: [
        {
          kind: "not_found",
          description:
            "No skill is registered under that name. Search or list skills and choose a returned exact name.",
        },
        {
          kind: "skill_unavailable",
          description:
            "The runtime has no skill registry configured. Stop attempting to load skills.",
        },
      ],
      notes: [
        "Calling load_skill is cheap, but the loaded content stays in your context for the rest of the turn — only load skills you will actually use.",
      ],
    }),
    parameters: loadSkillParams,
    execute: async (validatedArguments, toolContext) => {
      const { skillRegistry } = toolContext;
      if (!skillRegistry) {
        return errorResult<LoadSkillData>(
          toolError(
            "skill_unavailable",
            "No skill registry is configured for this agent. Skills cannot be loaded.",
            { recoverable: false },
          ),
        );
      }

      const skill = skillRegistry.get(validatedArguments.name);
      if (!skill) {
        const available = skillRegistry.list().map((entry) => entry.name);
        const suggestion =
          available.length > 0
            ? `Available skills: ${available.join(", ")}.`
            : "No skills are currently registered.";
        return errorResult<LoadSkillData>(
          toolError(
            "not_found",
            `Skill not found: ${validatedArguments.name}. ${suggestion}`,
            {
              recoverable: available.length > 0,
              suggestedNextAction:
                available.length > 0
                  ? "Use an available skill discovery tool and call load_skill with an exact returned name."
                  : undefined,
            },
          ),
        );
      }

      const data: LoadSkillData = {
        name: skill.name,
        description: skill.description,
        content: skill.content,
        sourcePath: skill.sourcePath,
        origin: skill.origin,
      };

      const header = `Loaded skill "${skill.name}" (${skill.origin}, source: ${skill.sourcePath}).`;
      const body = skill.content.length > 0 ? `\n\n${skill.content}` : "";
      return okResult<LoadSkillData>(`${header}${body}`, { data });
    },
  });
}
