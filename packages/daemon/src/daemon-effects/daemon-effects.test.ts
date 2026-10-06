import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { createDaemonStore } from "../server/daemon-store";
import { getLogger } from "@logtape/logtape";
import {
  createClientLifecycleEffect,
  createDaemonEventDispatcher,
  createRunLifecycleEffect,
} from "./daemon-effects";

const logger = getLogger(["comma", "daemon", "daemon-effects"]);
let debug: ReturnType<typeof spyOn<typeof logger, "debug">>;
let info: ReturnType<typeof spyOn<typeof logger, "info">>;
let error: ReturnType<typeof spyOn<typeof logger, "error">>;
beforeEach(() => {
  debug = spyOn(logger, "debug").mockReturnValue(undefined);
  info = spyOn(logger, "info").mockReturnValue(undefined);
  error = spyOn(logger, "error").mockReturnValue(undefined);
});
afterEach(() => {
  debug.mockRestore();
  info.mockRestore();
  error.mockRestore();
});

describe("createDaemonEventDispatcher", () => {
  it("should route actions to effects in order", () => {
    const calls: string[] = [];
    const events = createDaemonEventDispatcher({
      effects: [
        {
          name: "first",
          handle: (): void => {
            calls.push("first");
          },
        },
        {
          name: "second",
          handle: (): void => {
            calls.push("second");
          },
        },
      ],
    });

    events.publish({ type: "client.runtime.connected", clientId: "client-1" });

    expect(calls).toEqual(["first", "second"]);
  });

  it("should isolate an effect failure", () => {
    const calls: string[] = [];
    const events = createDaemonEventDispatcher({
      effects: [
        {
          name: "failing",
          handle(): void {
            throw new Error("failed");
          },
        },
        {
          name: "later",
          handle: (): void => {
            calls.push("later");
          },
        },
      ],
    });

    events.publish({ type: "client.runtime.connected", clientId: "client-1" });

    expect(calls).toEqual(["later"]);
    expect(error).toHaveBeenCalledWith("Daemon effect failing failed", {
      eventType: "client.runtime.connected",
      error: "failed",
    });
  });

  it("should dispose all effect delivery", () => {
    const calls: string[] = [];
    const effects = createDaemonEventDispatcher({
      effects: [
        {
          name: "test",
          handle: (): void => {
            calls.push("called");
          },
        },
      ],
    });
    effects.dispose();

    effects.publish({ type: "client.runtime.connected", clientId: "client-1" });

    expect(calls).toEqual([]);
  });

  it("should separate daemon-wide and per-run lifecycle effects", async () => {
    const store = createDaemonStore();
    const events = createDaemonEventDispatcher({
      effects: [createClientLifecycleEffect()],
    });

    store.addClient("client-1");
    events.publish({ type: "client.runtime.connected", clientId: "client-1" });
    const runStore = store.createRun(
      "/strategy.json",
      "Test",
      "/workspace",
      "run-1",
    );
    runStore.subscribeToTransitions(createRunLifecycleEffect());
    await runStore.transition({ type: "running" });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith("Client connected: client-1");
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith("Daemon run.running", {
      runId: "run-1",
    });
  });
});
