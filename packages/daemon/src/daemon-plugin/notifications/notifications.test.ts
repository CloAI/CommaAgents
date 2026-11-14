import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, test } from "vitest";
import { createPlugin } from "../plugin";

interface TestNotifications {
  changed: { readonly type: "changed"; readonly value: number };
  finished: { readonly type: "finished"; readonly result: string };
}

describe("plugin notifications", () => {
  test("should deliver only the selected type and key with a subscription-only public API", async () => {
    const { plugin, notifications } = createPlugin<
      "example",
      TestNotifications
    >({ name: "example", notifications: true, cleanup: async () => {} });
    expect(Object.keys(plugin.notifications)).toEqual(["subscribe"]);
    const values: number[] = [];
    const results: string[] = [];
    const unsubscribe = await plugin.notifications.subscribe(
      "changed",
      "one",
      (event) => {
        values.push(event.value);
      },
    );
    await plugin.notifications.subscribe("finished", "one", (event) => {
      results.push(event.result);
    });
    notifications.notify("two", { type: "changed", value: 1 });
    notifications.notify("one", { type: "changed", value: 2 });
    notifications.notify("one", { type: "finished", result: "done" });
    expect(values).toEqual([2]);
    expect(results).toEqual(["done"]);
    unsubscribe();
    unsubscribe();
    notifications.notify("one", { type: "changed", value: 3 });
    expect(values).toEqual([2]);

    // Compile-time contract checks are retained without invoking invalid subscriptions.
    void (async () => {
      // @ts-expect-error Unsupported notification names are rejected by the collection.
      await plugin.notifications.subscribe("missing", "one", () => {});
      await plugin.notifications.subscribe("changed", "one", (event) => {
        // @ts-expect-error The selected event has no result field.
        void event.result;
      });
      notifications.notify("one", {
        type: "changed",
        // @ts-expect-error Publishing validates the collection member's payload.
        result: "wrong payload",
      });
    });
    await plugin.dispose();
  });

  test("should complete hydration and initial replay before subscription readiness", async () => {
    const hydration = Promise.withResolvers<void>();
    const events: number[] = [];
    let currentValue = 1;
    const { plugin, notifications } = createPlugin<
      "example",
      TestNotifications
    >({
      name: "example",
      notifications: true,
      cleanup: async () => {},
      notificationHooks: {
        beforeSubscribe: () => hydration.promise,
        onSubscribe(type, key, deliver) {
          if (type === "changed" && key === "one") {
            deliver({ type: "changed", value: currentValue });
          }
        },
      },
    });
    const registration = plugin.notifications.subscribe(
      "changed",
      "one",
      (event) => {
        events.push(event.value);
      },
    );
    notifications.notify("one", { type: "changed", value: 2 });
    expect(events).toEqual([]);
    currentValue = 3;
    hydration.resolve();
    const unsubscribe = await registration;
    expect(events).toEqual([3]);
    notifications.notify("one", { type: "changed", value: 4 });
    expect(events).toEqual([3, 4]);
    unsubscribe();
    await plugin.dispose();
  });

  test("should capture all recipients before callbacks change subscriptions", async () => {
    const { plugin, notifications } = createPlugin<
      "example",
      TestNotifications
    >({
      name: "example",
      notifications: true,
      cleanup: async () => {},
      notificationHooks: {
        getRecipientKeys: (key) =>
          key === "child" ? ["child", "root"] : [key],
      },
    });
    const calls: string[] = [];
    let unsubscribeOther = (): void => {};
    let subscribeLater: Promise<() => void> | undefined;
    await plugin.notifications.subscribe("changed", "child", () => {
      calls.push("child");
      unsubscribeOther();
      subscribeLater ??= plugin.notifications.subscribe(
        "changed",
        "root",
        () => {
          calls.push("later");
        },
      );
    });
    unsubscribeOther = await plugin.notifications.subscribe(
      "changed",
      "root",
      () => {
        calls.push("root");
      },
    );
    notifications.notify("child", { type: "changed", value: 1 });
    expect(calls).toEqual(["child", "root"]);
    await subscribeLater;
    notifications.notify("child", { type: "changed", value: 2 });
    expect(calls).toEqual(["child", "root", "child", "later"]);
    await plugin.dispose();
  });

  test("should isolate thrown errors and async rejections without waiting for listeners", async () => {
    const { plugin, notifications } = createPlugin<
      "example",
      TestNotifications
    >({ name: "example", notifications: true, cleanup: async () => {} });
    const gate = Promise.withResolvers<void>();
    const calls: string[] = [];
    await plugin.notifications.subscribe("changed", "one", () => {
      throw new Error("sync failure");
    });
    await plugin.notifications.subscribe("changed", "one", async () => {
      throw new Error("async failure");
    });
    await plugin.notifications.subscribe("changed", "one", async () => {
      await gate.promise;
      calls.push("slow");
    });
    await plugin.notifications.subscribe("changed", "one", () => {
      calls.push("healthy");
    });
    notifications.notify("one", { type: "changed", value: 1 });
    expect(calls).toEqual(["healthy"]);
    gate.resolve();
    await delay(0);
    expect(calls).toEqual(["healthy", "slow"]);
    await plugin.dispose();
  });

  test("should reject new subscriptions during disposal, deliver final events, and clear after failed cleanup", async () => {
    const cleanupGate = Promise.withResolvers<void>();
    const events: string[] = [];
    const { plugin, notifications } = createPlugin<
      "example",
      TestNotifications
    >({
      name: "example",
      notifications: true,
      async cleanup() {
        notifications.notify("one", { type: "finished", result: "final" });
        await cleanupGate.promise;
        throw new Error("cleanup failed");
      },
    });
    await plugin.notifications.subscribe("finished", "one", (event) => {
      events.push(event.result);
    });
    const disposal = plugin.dispose();
    expect(plugin.dispose()).toBe(disposal);
    await expect(
      plugin.notifications.subscribe("finished", "one", () => {}),
    ).rejects.toThrow("disposing");
    expect(events).toEqual(["final"]);
    cleanupGate.resolve();
    await expect(disposal).rejects.toThrow("cleanup failed");
    notifications.notify("one", {
      type: "finished",
      result: "after cleanup",
    });
    expect(events).toEqual(["final"]);
    await expect(
      plugin.notifications.subscribe("finished", "one", () => {}),
    ).rejects.toThrow("disposed");
  });

  test("should reject subscriptions still hydrating when disposal starts", async () => {
    const hydration = Promise.withResolvers<void>();
    const { plugin } = createPlugin<"example", TestNotifications>({
      name: "example",
      notifications: true,
      cleanup: async () => {},
      notificationHooks: { beforeSubscribe: () => hydration.promise },
    });
    const registration = plugin.notifications.subscribe(
      "changed",
      "one",
      () => {},
    );
    await plugin.dispose();
    hydration.resolve();
    await expect(registration).rejects.toThrow("disposed");
  });
});
