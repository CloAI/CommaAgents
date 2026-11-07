import { z } from "zod/v4";

/** Strategy file whose agents and steps are described. */
export const DescribeStrategyArgumentsSchema = z
  .object({ strategyPath: z.string().min(1) })
  .strict();

/** Inference protections an agent requires of its model. */
export const AgentPrivacySchema = z
  .object({
    tee: z.literal("required").optional(),
    e2ee: z.literal("required").optional(),
  })
  .strict();

/** One agent in the strategy's registry. */
export const DescribedAgentSchema = z
  .object({
    name: z.string(),
    kind: z.enum(["llm", "user", "custom"]),
    description: z.string().optional(),
    /** `providerID/modelID` the agent uses, with any `@role` reference resolved. */
    model: z.string().optional(),
    /** Role named by the agent's model reference, such as `medium` for `@medium`. */
    modelRole: z.string().optional(),
    privacy: AgentPrivacySchema.optional(),
  })
  .strict();

/** One agent reference in flow order. */
export const DescribedStepSchema = z
  .object({
    flow: z.string(),
    flowType: z.string(),
    /** Nesting level of the owning flow; the entry flow is 0. */
    depth: z.number().int().nonnegative(),
    agent: z.string(),
    role: z.enum(["step", "observer"]),
    description: z.string().optional(),
  })
  .strict();

/** Agents and ordered steps of a strategy, without instantiating anything. */
export const DescribeStrategyOutputSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    /** Roles the strategy refers to, without the `@` prefix, including compaction models. */
    modelRoles: z.array(z.string()).readonly(),
    agents: z.array(DescribedAgentSchema).readonly(),
    steps: z.array(DescribedStepSchema).readonly(),
  })
  .strict();
