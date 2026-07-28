import { describe, expect, it } from "bun:test";
import { createDaemonStore } from "../daemon-store";
import type { Logger } from "../logger/logger.types";
import {
  createClientLifecycleEffect,
  createDaemonEventDispatcher,
  createRunLifecycleEffect,
} from "./daemon-effects";

function createRecordingLogger(): Logger & {
  readonly entries: Array<{ level: string; message: string }>;
} {
  const entries: Array<{ level: string; message: string }> = [];
  const logger: Logger & { readonly entries: typeof entries } = {
    entries,
    debug(message): void {
      entries.push({ level: "debug", message });
    },
    info(message): void {
      entries.push({ level: "info", message });
    },
    warn(message): void {
      entries.push({ level: "warn", message });
    },
    error(message): void {
      entries.push({ level: "error", message });
    },
    child(): Logger {
      return logger;
    },
    flush(): void {},
    close(): void {},
  };
  return logger;
}

describe("createDaemonEventDispatcher", () => {
  it("should route actions to effects in order", () => {
    const store = createDaemonStore();
    const calls: string[] = [];
    createDaemonEventDispatcher({
      daemonStore: store,
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
      logger: createRecordingLogger(),
    });

    store.addClient("client-1");

    expect(calls).toEqual(["first", "second"]);
  });

  it("should isolate an effect failure", () => {
    const store = createDaemonStore();
    const logger = createRecordingLogger();
    const calls: string[] = [];
    createDaemonEventDispatcher({
      daemonStore: store,
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
      logger,
    });

    store.addClient("client-1");

    expect(calls).toEqual(["later"]);
    expect(logger.entries).toContainEqual({
      level: "error",
      message: "Daemon effect failing failed",
    });
  });

  it("should dispose all effect delivery", () => {
    const store = createDaemonStore();
    const calls: string[] = [];
    const effects = createDaemonEventDispatcher({
      daemonStore: store,
      effects: [
        {
          name: "test",
          handle: (): void => {
            calls.push("called");
          },
        },
      ],
      logger: createRecordingLogger(),
    });
    effects.dispose();

    store.addClient("client-1");

    expect(calls).toEqual([]);
  });

  it("should log only matching client and run actions", () => {
    const store = createDaemonStore();
    const logger = createRecordingLogger();
    createDaemonEventDispatcher({
      daemonStore: store,
      effects: [
        createClientLifecycleEffect(logger),
        createRunLifecycleEffect(logger),
      ],
      logger,
    });

    store.addClient("client-1");
    store.createRun("/strategy.json", "Test", "/workspace", "run-1");

    expect(logger.entries).toEqual([
      { level: "info", message: "Client connected: client-1" },
      { level: "debug", message: "Daemon run.created" },
    ]);
  });
});
