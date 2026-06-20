import { describe, expect, it } from "bun:test";
import { createAbortableGenerator, createAbortablePromise } from "./abortable";

describe("createAbortablePromise", () => {
  it("should abort the executor signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const pendingPromise = createAbortablePromise(async (signal) => {
      capturedSignal = signal;
      await Promise.resolve();
      return "complete";
    });

    pendingPromise.abort();

    expect(capturedSignal?.aborted).toBe(true);
    expect(await pendingPromise).toBe("complete");
  });
});

describe("createAbortableGenerator", () => {
  it("should abort the generator signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const generator = createAbortableGenerator(async function* (signal) {
      capturedSignal = signal;
      yield "event";
    });

    await generator.next();
    generator.abort();

    expect(capturedSignal?.aborted).toBe(true);
  });
});
