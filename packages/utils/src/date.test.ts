// Tests for date utilities.

import { describe, expect, it } from "bun:test";
import { isoNow } from "./date";

describe("isoNow", () => {
  it("should return a valid ISO 8601 string", () => {
    const result = isoNow();
    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("should return a time close to now", () => {
    const before = Date.now();
    const result = isoNow();
    const after = Date.now();

    const parsed = new Date(result).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
