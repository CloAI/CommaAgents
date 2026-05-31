// Tests for the steer_run request schema validation.

import { describe, expect, test } from "bun:test";
import { SteerRunMessage } from "./steer-run.schema";

describe("SteerRunMessage", () => {
  test("accepts a valid steer request", () => {
    const parsed = SteerRunMessage.safeParse({
      type: "steer_run",
      runId: "run-1",
      text: "focus on the login bug",
    });
    expect(parsed.success).toBe(true);
  });

  test("accepts a request with requestId", () => {
    const parsed = SteerRunMessage.safeParse({
      type: "steer_run",
      runId: "run-1",
      text: "hello",
      requestId: "req-1",
    });
    expect(parsed.success).toBe(true);
  });

  test("rejects empty runId", () => {
    const parsed = SteerRunMessage.safeParse({
      type: "steer_run",
      runId: "",
      text: "hello",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects empty text", () => {
    const parsed = SteerRunMessage.safeParse({
      type: "steer_run",
      runId: "run-1",
      text: "",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects wrong type", () => {
    const parsed = SteerRunMessage.safeParse({
      type: "user_input",
      runId: "run-1",
      text: "hello",
    });
    expect(parsed.success).toBe(false);
  });
});
