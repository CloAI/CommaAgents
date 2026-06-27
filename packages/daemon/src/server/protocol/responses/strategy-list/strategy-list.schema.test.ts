// Tests for RunSummarySchema.

import { describe, expect, test } from "bun:test";
import { RunSummarySchema } from "./strategy-list.schema";

describe("RunSummarySchema", () => {
  const valid = {
    runId: "run-1",
    strategyName: "test-strategy",
    status: "running" as const,
    startedAt: "2026-03-01T12:00:00.000Z",
  };

  test("parses valid summary without completedAt", () => {
    expect(RunSummarySchema.parse(valid)).toEqual(valid);
  });

  test("parses valid summary with completedAt", () => {
    const withCompleted = { ...valid, completedAt: "2026-03-01T12:05:00.000Z" };
    expect(RunSummarySchema.parse(withCompleted)).toEqual(withCompleted);
  });

  test("accepts all status values", () => {
    for (const status of [
      "running",
      "completed",
      "error",
      "cancelled",
    ] as const) {
      expect(RunSummarySchema.parse({ ...valid, status }).status).toBe(status);
    }
  });

  test("rejects invalid status", () => {
    expect(
      RunSummarySchema.safeParse({ ...valid, status: "paused" }).success,
    ).toBe(false);
  });

  test("rejects non-ISO startedAt", () => {
    expect(
      RunSummarySchema.safeParse({ ...valid, startedAt: "yesterday" }).success,
    ).toBe(false);
  });
});
