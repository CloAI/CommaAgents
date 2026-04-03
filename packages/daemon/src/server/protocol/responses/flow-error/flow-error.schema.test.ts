// Tests for ErrorInfoSchema.

import { describe, expect, test } from "bun:test";
import { ErrorInfoSchema } from "./flow-error.schema";

describe("ErrorInfoSchema", () => {
  test("parses valid error info", () => {
    expect(ErrorInfoSchema.parse({ code: "NOT_FOUND", message: "Run not found" })).toEqual({
      code: "NOT_FOUND",
      message: "Run not found",
    });
  });

  test("rejects missing code", () => {
    expect(ErrorInfoSchema.safeParse({ message: "oops" }).success).toBe(false);
  });

  test("rejects missing message", () => {
    expect(ErrorInfoSchema.safeParse({ code: "ERR" }).success).toBe(false);
  });
});
