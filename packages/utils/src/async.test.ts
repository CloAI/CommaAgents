// Tests for async utilities.

import { describe, expect, it } from "bun:test";
import { sleep } from "./async";

describe("sleep", () => {
  it("should resolve after the specified delay", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;

    // Allow some tolerance for timer imprecision
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it("should resolve with undefined", async () => {
    const result = await sleep(1);
    expect(result).toBeUndefined();
  });

  it("should resolve immediately for 0ms", async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
