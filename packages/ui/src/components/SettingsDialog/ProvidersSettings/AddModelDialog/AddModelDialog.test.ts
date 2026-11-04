import { describe, expect, it } from "vitest";
import { addModelSchema } from "./AddModelDialog.schemas";
import {
  EMPTY_CAPABILITIES,
  EMPTY_MODEL_DRAFT,
} from "./AddModelDialog.constants";
import { parseModelMetadata } from "./AddModelDialog.utils";

const schema = addModelSchema(["local"]);

describe("addModelSchema", () => {
  it.each(["", "missing"])(
    "should reject an unavailable provider %j",
    (providerId) => {
      const result = schema.safeParse({
        providerId,
        draft: { ...EMPTY_MODEL_DRAFT, modelId: "model" },
        capabilities: EMPTY_CAPABILITIES,
        modalities: { input: [], output: [] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(["providerId"]);
      }
    },
  );

  it.each(["", "  ", "local/"])(
    "should require a provider-local model ID for %j",
    (modelId) => {
      const result = schema.safeParse({
        providerId: "local",
        draft: { ...EMPTY_MODEL_DRAFT, modelId },
        capabilities: EMPTY_CAPABILITIES,
        modalities: { input: [], output: [] },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toEqual(["draft", "modelId"]);
      }
    },
  );

  it.each([
    ["contextWindow", "-1"],
    ["maxInputTokens", "1.5"],
    ["maxOutputTokens", "9007199254740992"],
    ["inputCost", "-1"],
    ["cacheReadCost", "Infinity"],
    ["outputCost", "abc"],
    ["knowledgeCutoff", "2025-02-29"],
    ["releaseDate", "2026-13-01"],
    ["lastUpdated", "2026-04-31"],
  ])("should reject invalid %s and identify the field", (key, value) => {
    const result = schema.safeParse({
      providerId: "local",
      draft: { ...EMPTY_MODEL_DRAFT, modelId: "model", [key]: value },
      capabilities: EMPTY_CAPABILITIES,
      modalities: { input: [], output: [] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["draft", key]);
    }
  });
});

describe("parseModelMetadata", () => {
  it("should leave empty optional metadata unspecified", () => {
    expect(
      parseModelMetadata(EMPTY_MODEL_DRAFT, EMPTY_CAPABILITIES, {
        input: [],
        output: [],
      }),
    ).toEqual({});
  });

  it("should retain zero prices, leap dates, and selected capabilities", () => {
    expect(
      parseModelMetadata(
        {
          ...EMPTY_MODEL_DRAFT,
          name: " Model ",
          contextWindow: "0",
          inputCost: "0",
          outputCost: "1.25",
          knowledgeCutoff: "2024-02",
          releaseDate: "2024-02-29",
        },
        { ...EMPTY_CAPABILITIES, tools: true },
        { input: ["text"], output: [] },
      ),
    ).toEqual({
      name: "Model",
      contextWindow: 0,
      cost: { input: 0, output: 1.25 },
      knowledgeCutoff: "2024-02",
      releaseDate: "2024-02-29",
      capabilities: { tools: true },
      modalities: { input: ["text"] },
    });
  });
});
