import { describe, expect, it } from "vitest";
import { operationError, runError } from "./errors";
import { RunErrorCode } from "./errors.types";
import { RunErrorSchema } from "../state/state.schemas";

describe("run error diagnostics", () => {
  it("should preserve nested failure messages through serialization and rethrowing", () => {
    const cause = new Error("Agent writer failed", {
      cause: new Error("Provider rejected the request: quota exceeded"),
    });
    const failure = operationError(
      RunErrorCode.EXECUTION_ERROR,
      "run-1",
      cause,
    );
    const restored = RunErrorSchema.parse(JSON.parse(JSON.stringify(failure)));
    expect(restored).toEqual({
      code: RunErrorCode.EXECUTION_ERROR as const,
      message:
        "Agent writer failed\nCaused by: Provider rejected the request: quota exceeded",
      metadata: { runId: "run-1" },
    });
    expect(runError(restored).message).toBe(
      "Agent writer failed\nCaused by: Provider rejected the request: quota exceeded",
    );
    expect(
      operationError(
        RunErrorCode.PREPARATION_ERROR,
        "run-1",
        runError(restored),
      ),
    ).toEqual(failure);
    expect(JSON.stringify(restored)).not.toContain("at ");
  });

  it("should accept older errors without diagnostic text", () => {
    const failure = {
      code: RunErrorCode.EXECUTION_ERROR as const,
      metadata: { runId: "run-1" },
    };
    expect(RunErrorSchema.parse(failure)).toEqual(failure);
    expect(runError(failure).message).toBe("Run execution failed");
  });

  it("should preserve string failures and ignore unrecognized payloads", () => {
    expect(
      operationError(
        RunErrorCode.EXECUTION_ERROR,
        "run-1",
        "Connection closed",
      ),
    ).toMatchObject({ message: "Connection closed" });
    expect(
      operationError(RunErrorCode.EXECUTION_ERROR, "run-1", {
        responseBody: "raw response",
      }),
    ).not.toHaveProperty("message");
  });

  it("should handle circular causes without repeating messages", () => {
    const cause = new Error("Connection failed");
    cause.cause = new Error("Connection failed", { cause });
    expect(
      operationError(RunErrorCode.EXECUTION_ERROR, "run-1", cause),
    ).toMatchObject({ message: "Connection failed" });
  });
});
