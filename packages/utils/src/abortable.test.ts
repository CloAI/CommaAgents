// Tests for abortable wrapper factories.

import { describe, expect, it } from "bun:test";
import { createAbortableGenerator, createAbortablePromise } from "./abortable";

describe("createAbortablePromise", () => {
  it("should resolve with the executor result", async () => {
    const pending = createAbortablePromise(async (_signal) => "hello");
    const result = await pending;

    expect(result).toBe("hello");
  });

  it("should pass an AbortSignal to the executor", async () => {
    let receivedSignal: AbortSignal | undefined;

    const pending = createAbortablePromise(async (signal) => {
      receivedSignal = signal;
      return "done";
    });
    await pending;

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("should have an abort method on the returned promise", () => {
    const pending = createAbortablePromise(async (_signal) => "value");

    expect(typeof pending.abort).toBe("function");
  });

  it("should abort the signal when abort() is called", async () => {
    let receivedSignal: AbortSignal | undefined;

    const pending = createAbortablePromise((signal) => {
      receivedSignal = signal;
      return new Promise((_resolve) => {
        // Never resolves — waits for abort
      });
    });

    pending.abort();

    expect(receivedSignal?.aborted).toBe(true);
  });

  it("should reject with an abort error when aborted during execution", async () => {
    const pending = createAbortablePromise((signal) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    pending.abort();

    await expect(pending).rejects.toThrow("The operation was aborted.");
  });

  it("should be thenable like a regular promise", async () => {
    const pending = createAbortablePromise(async (_signal) => 42);
    const doubled = await pending.then((value) => value * 2);

    expect(doubled).toBe(84);
  });

  it("should provide a unique signal per invocation", () => {
    const signals: AbortSignal[] = [];

    const first = createAbortablePromise(async (signal) => {
      signals.push(signal);
      return "first";
    });
    const _second = createAbortablePromise(async (signal) => {
      signals.push(signal);
      return "second";
    });

    first.abort();

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });
});

describe("createAbortableGenerator", () => {
  it("should yield values from the inner generator", async () => {
    const stream = createAbortableGenerator(async function* (_signal) {
      yield "one";
      yield "two";
      yield "three";
    });

    const values: string[] = [];
    for await (const value of stream) {
      values.push(value);
    }

    expect(values).toEqual(["one", "two", "three"]);
  });

  it("should pass an AbortSignal to the generator factory", async () => {
    let receivedSignal: AbortSignal | undefined;

    const stream = createAbortableGenerator(async function* (signal) {
      receivedSignal = signal;
      yield "value";
    });

    // Consume the generator to trigger execution
    for await (const _value of stream) {
      // consume
    }

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("should have an abort method on the returned generator", () => {
    const stream = createAbortableGenerator(async function* (_signal) {
      yield "value";
    });

    expect(typeof stream.abort).toBe("function");
  });

  it("should abort the signal when abort() is called", async () => {
    let receivedSignal: AbortSignal | undefined;

    const stream = createAbortableGenerator(async function* (signal) {
      receivedSignal = signal;
      yield "first";
      // Signal should be aborted before this yields
      yield "second";
    });

    // Consume first value then abort
    await stream.next();
    stream.abort();

    expect(receivedSignal?.aborted).toBe(true);
  });

  it("should provide a unique signal per invocation", async () => {
    const signals: AbortSignal[] = [];

    const first = createAbortableGenerator(async function* (signal) {
      signals.push(signal);
      yield "first";
    });
    const second = createAbortableGenerator(async function* (signal) {
      signals.push(signal);
      yield "second";
    });

    // Consume one value from each to trigger execution
    await first.next();
    await second.next();

    first.abort();

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("should support return() to end iteration", async () => {
    const stream = createAbortableGenerator(async function* (_signal) {
      yield "one";
      yield "two";
      yield "three";
    });

    const firstResult = await stream.next();
    expect(firstResult.value).toBe("one");

    const returnResult = await stream.return(undefined);
    expect(returnResult.done).toBe(true);
  });
});
