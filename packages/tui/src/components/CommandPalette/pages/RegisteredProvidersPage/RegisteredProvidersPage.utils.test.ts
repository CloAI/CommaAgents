import { describe, expect, it } from "bun:test";
import {
  createProviderSearchString,
  isPrintableCharacter,
} from "./RegisteredProvidersPage.utils";

describe("RegisteredProvidersPage utils", () => {
  it("builds a provider search string from canonical wire data", () => {
    expect(
      createProviderSearchString({
        id: "openai",
        name: "OpenAI",
        credentialType: "api",
        authStatus: "configured",
        models: [{ id: "gpt-4o" }, { id: "o3" }],
        modelsSource: "catalog",
        isCustom: false,
      }),
    ).toContain("openai OpenAI API Key gpt-4o o3");
  });

  it("accepts printable input and rejects control keys", () => {
    expect(isPrintableCharacter("a", {})).toBe(true);
    expect(isPrintableCharacter("", {})).toBe(false);
    expect(isPrintableCharacter("a", { meta: true })).toBe(false);
    expect(isPrintableCharacter("a", { ctrl: true })).toBe(false);
    expect(isPrintableCharacter("a", { tab: true })).toBe(false);
    expect(isPrintableCharacter("a", { upArrow: true })).toBe(false);
  });
});
