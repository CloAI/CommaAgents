import { describe, expect, it } from "bun:test";
import { parseModelRoleFlags } from "./models";

describe("parseModelRoleFlags", () => {
  it("should read repeated role=provider/model entries", () => {
    expect(
      parseModelRoleFlags(["medium=openai/gpt-5", "@simple=openrouter/a/b=c"]),
    ).toEqual({ medium: "openai/gpt-5", simple: "openrouter/a/b=c" });
  });

  it("should reject entries without a model", () => {
    expect(() => parseModelRoleFlags(["medium"])).toThrow("--model-role");
    expect(() => parseModelRoleFlags(["medium="])).toThrow("--model-role");
  });
});
