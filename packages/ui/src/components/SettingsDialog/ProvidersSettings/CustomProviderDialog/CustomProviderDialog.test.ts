import { describe, expect, it } from "vitest";
import { customProviderSchema } from "./CustomProviderDialog.schemas";

const draft = {
  id: "local",
  name: "Local",
  baseURL: "http://localhost:1234/v1",
  credentialType: "api",
  apiKey: "",
  models: "",
};

describe("customProviderSchema", () => {
  it("should trim endpoint fields and allow an optional key", () => {
    expect(
      customProviderSchema.parse({
        ...draft,
        id: " local ",
        name: " Local ",
        baseURL: " http://localhost:1234/v1 ",
      }),
    ).toEqual(draft);
  });

  it.each([
    "file:///tmp/api",
    "https://user:secret@example.com",
    "https://example.com?key=secret",
    "https://example.com#fragment",
    "invalid",
  ])("should reject unsafe API endpoints %s", (baseURL) => {
    const result = customProviderSchema.safeParse({ ...draft, baseURL });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["baseURL"]);
    }
  });

  it.each([{ id: "Uppercase" }, { id: "" }, { name: " " }])(
    "should reject invalid identity fields %j",
    (fields) => {
      expect(
        customProviderSchema.safeParse({ ...draft, ...fields }).success,
      ).toBe(false);
    },
  );
});
