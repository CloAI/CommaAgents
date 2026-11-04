import { describe, expect, it } from "vitest";
import { providerConfigurationSchema } from "./ProviderConfigurationDialog.schemas";

describe("providerConfigurationSchema", () => {
  it("should reject whitespace when credentials are required", () => {
    const result = providerConfigurationSchema(true).safeParse({
      apiKey: "  ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Enter an API key.");
    }
  });

  it("should keep existing credentials when no replacement is entered", () => {
    expect(providerConfigurationSchema(false).parse({ apiKey: " " })).toEqual({
      apiKey: "",
    });
  });

  it("should trim replacement credentials", () => {
    expect(
      providerConfigurationSchema(true).parse({ apiKey: " secret " }),
    ).toEqual({ apiKey: "secret" });
  });
});
