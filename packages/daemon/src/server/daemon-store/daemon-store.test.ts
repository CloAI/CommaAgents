import { describe, expect, it } from "bun:test";
import { createDaemonStore } from "./daemon-store";

describe("createDaemonStore", () => {
  it("should register and retrieve independent run stores", () => {
    const daemonStore = createDaemonStore();
    const firstRunStore = daemonStore.createRun(
      "/first.json",
      "First",
      "/workspace",
      "run-1",
    );
    const secondRunStore = daemonStore.createRun(
      "/second.json",
      "Second",
      "/workspace",
      "run-2",
    );

    expect(daemonStore.getRunStore("run-1")).toBe(firstRunStore);
    expect(daemonStore.listRunStores()).toEqual([
      firstRunStore,
      secondRunStore,
    ]);
  });

  it("should restore an immutable run snapshot into a new store", async () => {
    const daemonStore = createDaemonStore();
    const originalRunStore = daemonStore.createRun(
      "/strategy.json",
      "Test",
      "/workspace",
      "run-1",
    );
    await originalRunStore.transition({ type: "running" });
    const snapshot = originalRunStore.snapshot();
    daemonStore.removeRun(originalRunStore.id);

    const restoredRunStore = daemonStore.restoreRun(snapshot);

    expect(restoredRunStore.snapshot()).toEqual(snapshot);
    expect(restoredRunStore.abortSignal.aborted).toBe(false);
  });

  it("should dispose a removed run store", () => {
    const daemonStore = createDaemonStore();
    const runStore = daemonStore.createRun(
      "/strategy.json",
      "Test",
      "/workspace",
      "run-1",
    );

    expect(daemonStore.removeRun(runStore.id)).toBe(true);
    expect(daemonStore.removeRun(runStore.id)).toBe(false);
    expect(() => runStore.snapshot()).toThrow("Run store disposed: run-1");
  });

  it("should remove a disconnected client from every run", () => {
    const daemonStore = createDaemonStore();
    const firstRunStore = daemonStore.createRun(
      "/first.json",
      "First",
      "/workspace",
    );
    const secondRunStore = daemonStore.createRun(
      "/second.json",
      "Second",
      "/workspace",
    );
    daemonStore.addClient("client-1");
    firstRunStore.addSubscriber("client-1");
    secondRunStore.addSubscriber("client-1");

    daemonStore.removeClient("client-1");

    expect(daemonStore.getClients()).toEqual([]);
    expect(firstRunStore.getSubscribers()).toEqual([]);
    expect(secondRunStore.getSubscribers()).toEqual([]);
  });
});
