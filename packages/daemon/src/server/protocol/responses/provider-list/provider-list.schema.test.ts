// Tests for the provider_list response schema validation.

import { describe, expect, test } from "bun:test";
import { ProviderListMessage } from "./provider-list.schema";

describe("ProviderListMessage", () => {
  test("accepts empty provider list", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [],
      ts: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts populated provider list with rich model metadata", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          authStatus: "configured",
          models: [
            {
              id: "gpt-4o",
              name: "GPT-4o",
              contextWindow: 128000,
              cost: { input: 2.5, output: 10 },
              capabilities: { tools: true, vision: true },
              modalities: { input: ["text", "image"], output: ["text"] },
            },
            { id: "gpt-4o-mini" },
          ],
          modelsSource: "catalog",
          isCustom: false,
        },
        {
          id: "my-custom",
          name: "My Custom",
          authStatus: "none",
          models: [],
          modelsSource: "catalog",
          isCustom: true,
        },
      ],
      ts: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts live merged source with fetchedAt", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [
        {
          id: "ollama",
          name: "Ollama",
          authStatus: "configured",
          models: [{ id: "llama3.3" }],
          modelsSource: "merged",
          fetchedAt: new Date().toISOString(),
          isCustom: false,
        },
      ],
      ts: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts error source with error message", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [
        {
          id: "github-copilot",
          name: "GitHub Copilot",
          authStatus: "none",
          models: [],
          modelsSource: "error",
          error: "Unauthorized",
          isCustom: false,
        },
      ],
      ts: new Date().toISOString(),
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects invalid authStatus", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          authStatus: "validated",
          models: [],
          modelsSource: "catalog",
          isCustom: false,
        },
      ],
      ts: new Date().toISOString(),
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects invalid modelsSource", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          authStatus: "none",
          models: [],
          modelsSource: "guessed",
          isCustom: false,
        },
      ],
      ts: new Date().toISOString(),
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects string models (must be ModelInfo objects)", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          authStatus: "none",
          models: ["gpt-4o"],
          modelsSource: "catalog",
          isCustom: false,
        },
      ],
      ts: new Date().toISOString(),
    });
    expect(parsed.success).toBe(false);
  });

  test("requires ts", () => {
    const parsed = ProviderListMessage.safeParse({
      type: "provider_list",
      providers: [],
    });
    expect(parsed.success).toBe(false);
  });
});
