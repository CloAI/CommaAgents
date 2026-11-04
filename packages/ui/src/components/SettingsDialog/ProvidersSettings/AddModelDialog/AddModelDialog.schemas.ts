import { z } from "zod";

/** Keep empty numeric drafts unknown and preserve explicitly entered zeroes.
 * @param {string} label - User-facing field name.
 * @param {boolean} whole - Whether only safe whole numbers are accepted.
 * @returns {z.ZodString} Schema for an optional numeric draft.
 */
function optionalNumber(label: string, whole: boolean) {
  return z.string().refine(
    (value) => {
      if (!value.trim()) {
        return true;
      }
      const number = Number(value);
      return (
        number >= 0 &&
        (whole ? Number.isSafeInteger(number) : Number.isFinite(number))
      );
    },
    whole
      ? `${label} must be a nonnegative whole number.`
      : `${label} pricing must be a nonnegative number.`,
  );
}

/** Reject impossible calendar dates rather than allowing Date to roll them forward.
 * @param {string} label - User-facing field name.
 * @param {boolean} allowMonth - Whether a year and month are sufficient.
 * @returns {z.ZodString} Schema for an optional calendar date.
 */
function optionalDate(label: string, allowMonth = false) {
  return z.string().refine(
    (value) => {
      if (!value.trim()) {
        return true;
      }
      const normalized =
        allowMonth && /^\d{4}-\d{2}$/.test(value.trim())
          ? `${value.trim()}-01`
          : value.trim();
      const date = new Date(`${normalized}T00:00:00Z`);
      return (
        /^\d{4}-\d{2}-\d{2}$/.test(normalized) &&
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === normalized
      );
    },
    `${label} must be a valid ${allowMonth ? "YYYY-MM or YYYY-MM-DD" : "YYYY-MM-DD"} date.`,
  );
}

export const modelDraftSchema = z.object({
  modelId: z.string(),
  name: z.string(),
  contextWindow: optionalNumber("Context window", true),
  maxInputTokens: optionalNumber("Maximum input tokens", true),
  maxOutputTokens: optionalNumber("Maximum output tokens", true),
  knowledgeCutoff: optionalDate("Knowledge cutoff", true),
  releaseDate: optionalDate("Release date"),
  lastUpdated: optionalDate("Last updated"),
  status: z.enum(["", "alpha", "beta", "deprecated"]),
  inputCost: optionalNumber("Input", false),
  outputCost: optionalNumber("Output", false),
  reasoningCost: optionalNumber("Reasoning", false),
  cacheReadCost: optionalNumber("Cache read", false),
  cacheWriteCost: optionalNumber("Cache write", false),
});

/** Build validation against the providers available to this dialog.
 * @param {readonly string[]} providerIds - Selectable provider identities.
 * @returns {z.ZodObject} Schema for model fields and optional metadata.
 * @example
 * const schema = addModelSchema(["openai"]);
 */
export function addModelSchema(providerIds: readonly string[]) {
  return z
    .object({
      providerId: z
        .string()
        .refine((value) => providerIds.includes(value), "Choose a provider."),
      draft: modelDraftSchema,
      capabilities: z.object({
        tools: z.boolean(),
        reasoning: z.boolean(),
        vision: z.boolean(),
        attachment: z.boolean(),
        structuredOutput: z.boolean(),
        teeAttestation: z.boolean(),
        e2ee: z.boolean(),
      }),
      modalities: z.object({
        input: z.array(z.string()),
        output: z.array(z.string()),
      }),
    })
    .superRefine(({ providerId, draft }, context) => {
      if (!draft.modelId.trim() || draft.modelId.trim() === `${providerId}/`) {
        context.addIssue({
          code: "custom",
          path: ["draft", "modelId"],
          message: "Model ID is required.",
        });
      }
    });
}
