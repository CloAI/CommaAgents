import { z } from "zod/v4";

export const StrategyChangeSchema = z
  .object({
    type: z.literal("strategy.changed"),
    messageId: z.string(),
    runId: z.string(),
    createdAt: z.string(),
    revision: z.number().int().positive(),
    previousName: z.string(),
    nextName: z.string(),
    previousStrategyPath: z.string(),
    nextStrategyPath: z.string(),
  })
  .strict();

export const ContextMessageSchema = z
  .object({
    messageId: z.string(),
    speaker: z.string(),
    text: z.string(),
    createdAt: z.string(),
  })
  .strict();

export const StrategyStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    changes: z.array(StrategyChangeSchema),
    handoff: z
      .object({
        messages: z.array(ContextMessageSchema),
        eventOffset: z.number().int().nonnegative(),
        throughMessageId: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const SwitchStrategyArgumentsSchema = z
  .object({
    runId: z.string().min(1),
    strategyPath: z.string().min(1),
    manifestPath: z.string().min(1).nullable().optional(),
    /** Merged over the run's saved roles; `null` clears them. */
    modelRoles: z.record(z.string().min(1), z.string().min(1)).nullable().optional(),
    stop: z.boolean().default(false),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

export const SendRunArgumentsSchema = z
  .object({
    runId: z.string().min(1),
    input: z.string().min(1),
    contextChoice: z.enum(["compact", "recent", "full"]).optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

export const SendRunOutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started") }).strict(),
  z
    .object({
      type: z.literal("context_required"),
      estimatedTokens: z.number(),
      tokenLimit: z.number().optional(),
      recentCount: z.number(),
      error: z.string().optional(),
    })
    .strict(),
]);
