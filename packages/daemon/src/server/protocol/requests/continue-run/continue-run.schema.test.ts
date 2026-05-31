// Tests for the continue_run request schema validation.

import { describe, expect, test } from "bun:test";
import { ContinueRunMessage } from "./continue-run.schema";

describe("ContinueRunMessage", () => {
  test("accepts a minimal continue request", () => {
    const parsed = ContinueRunMessage.safeParse({
      type: "continue_run",
      runId: "run-1",
      input: "now write the tests",
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts a request switching strategy", () => {
    const parsed = ContinueRunMessage.safeParse({
      type: "continue_run",
      runId: "run-1",
      input: "review it",
      strategyPath: "/strategies/qa.json",
      modelOverride: "github-copilot/gpt-4o",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects empty input", () => {
    const parsed = ContinueRunMessage.safeParse({
      type: "continue_run",
      runId: "run-1",
      input: "",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects empty runId", () => {
    const parsed = ContinueRunMessage.safeParse({
      type: "continue_run",
      runId: "",
      input: "go",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects empty strategyPath when provided", () => {
    const parsed = ContinueRunMessage.safeParse({
      type: "continue_run",
      runId: "run-1",
      input: "go",
      strategyPath: "",
    });
    expect(parsed.success).toBe(false);
  });
});
