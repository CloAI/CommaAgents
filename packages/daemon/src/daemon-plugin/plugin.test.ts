import { expect, test } from "bun:test";
import { createPlugin } from "./plugin";

test("base plugin names the feature and cleans up once", async () => {
  const cleanupGate = Promise.withResolvers<void>();
  let cleanups = 0;
  const plugin = createPlugin({
    name: "example",
    async cleanup() {
      cleanups++;
      await cleanupGate.promise;
    },
  });
  expect(Object.keys(plugin).sort()).toEqual(["dispose", "name"]);
  expect(plugin.name).toBe("example");
  const disposal = plugin.dispose();
  expect(plugin.dispose()).toBe(disposal);
  cleanupGate.resolve();
  await disposal;
  expect(cleanups).toBe(1);
  expect(plugin.dispose()).toBe(disposal);
});

test("failed cleanup shares the original failure without retrying resources", async () => {
  let cleanups = 0;
  const plugin = createPlugin({
    name: "example",
    async cleanup() {
      cleanups++;
      throw new Error("cleanup failed");
    },
  });
  const disposal = plugin.dispose();
  await expect(disposal).rejects.toThrow("cleanup failed");
  expect(plugin.dispose()).toBe(disposal);
  expect(cleanups).toBe(1);
});
