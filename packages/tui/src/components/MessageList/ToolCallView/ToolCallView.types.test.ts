import { describe, expect, it } from "bun:test";
import { deriveToolCallViewStatus } from "./ToolCallView.types";

describe("deriveToolCallViewStatus", () => {
  it("maps missing and completed results to visual status", () => {
    expect(deriveToolCallViewStatus(undefined)).toBe("running");
    expect(deriveToolCallViewStatus({ status: "completed" })).toBe("completed");
    expect(deriveToolCallViewStatus({ status: "error" })).toBe("error");
  });
});
