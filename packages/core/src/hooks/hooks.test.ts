// Tests for hook utility functions

import { describe, expect, it } from "bun:test";
import {
  runSideEffectHooks,
  runTransformHooks,
  type SideEffectHook,
  type TransformHook,
} from ".";

describe("runSideEffectHooks", () => {
  it("should do nothing when hooks are undefined", async () => {
    await runSideEffectHooks(undefined, "test");
    // No error means success
  });

  it("should do nothing when hooks array is empty", async () => {
    await runSideEffectHooks([], "test");
  });

  it("should execute hooks in order", async () => {
    const order: number[] = [];
    const hooks: SideEffectHook<string>[] = [
      () => {
        order.push(1);
      },
      () => {
        order.push(2);
      },
      () => {
        order.push(3);
      },
    ];

    await runSideEffectHooks(hooks, "test");
    expect(order).toEqual([1, 2, 3]);
  });

  it("should pass the value to each hook", async () => {
    const received: string[] = [];
    const hooks: SideEffectHook<string>[] = [
      (v) => {
        received.push(v);
      },
      (v) => {
        received.push(v);
      },
    ];

    await runSideEffectHooks(hooks, "hello");
    expect(received).toEqual(["hello", "hello"]);
  });

  it("should handle async hooks", async () => {
    const order: number[] = [];
    const hooks: SideEffectHook<string>[] = [
      async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      },
      async () => {
        order.push(2);
      },
    ];

    await runSideEffectHooks(hooks, "test");
    expect(order).toEqual([1, 2]);
  });

  it("should work with non-string types", async () => {
    const received: number[] = [];
    const hooks: SideEffectHook<number>[] = [
      (v) => {
        received.push(v);
      },
    ];

    await runSideEffectHooks(hooks, 42);
    expect(received).toEqual([42]);
  });
});

describe("runTransformHooks", () => {
  it("should return the original value when hooks are undefined", async () => {
    const result = await runTransformHooks(undefined, "test");
    expect(result).toBe("test");
  });

  it("should return the original value when hooks array is empty", async () => {
    const result = await runTransformHooks([], "test");
    expect(result).toBe("test");
  });

  it("should chain transforms in order", async () => {
    const hooks: TransformHook<string>[] = [
      (v) => `${v}A`,
      (v) => `${v}B`,
      (v) => `${v}C`,
    ];

    const result = await runTransformHooks(hooks, "start-");
    expect(result).toBe("start-ABC");
  });

  it("should handle async transforms", async () => {
    const hooks: TransformHook<string>[] = [
      async (v) => {
        await new Promise((r) => setTimeout(r, 10));
        return `${v}-async`;
      },
      (v) => `${v}-sync`,
    ];

    const result = await runTransformHooks(hooks, "start");
    expect(result).toBe("start-async-sync");
  });

  it("should allow hooks to completely replace the value", async () => {
    const hooks: TransformHook<string>[] = [() => "replaced"];

    const result = await runTransformHooks(hooks, "original");
    expect(result).toBe("replaced");
  });

  it("should work with non-string types", async () => {
    const hooks: TransformHook<number>[] = [(v) => v * 2, (v) => v + 1];

    const result = await runTransformHooks(hooks, 5);
    expect(result).toBe(11);
  });
});
