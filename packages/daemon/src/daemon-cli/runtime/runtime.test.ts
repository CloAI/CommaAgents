import { expect, test, vi } from "vitest";
import { getConfig, getLogger } from "@logtape/logtape";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DaemonConfig } from "../../config";
import type { CreateDaemonKernelOptions } from "../../daemon-kernel";
import type { CreateDaemonServerOptions } from "../../daemon-server";

for (const failure of [
  "none",
  "kernel",
  "server",
  "start",
  "pid",
  "stop",
  "dispose",
] as const) {
  test(`runtime releases kernel, transport, logging, and handlers (${failure})`, async () => {
    vi.resetModules();
    const directory = mkdtempSync(join(tmpdir(), "comma-runtime-logging-"));
    try {
      const calls: string[] = [];
      const signals = [
        "uncaughtException",
        "unhandledRejection",
        "SIGINT",
        "SIGTERM",
      ];
      const listeners = signals.map((signal) => process.listenerCount(signal));
      vi.doMock("../../daemon-kernel/index.ts", () => ({
        async createDaemonKernel({
          runs,
          initialize,
        }: CreateDaemonKernelOptions) {
          calls.push("kernel");
          expect(runs?.runsDir).toBe("runs-directory");
          if (failure === "kernel") {
            throw new Error("kernel");
          }
          await initialize?.({
            runs: {
              registerRunPreparation(registration: {
                name: string;
                prepare: unknown;
              }) {
                expect(registration.name).toBe("privacy");
                expect(typeof registration.prepare).toBe("function");
              },
              registerStrategyHooks(registration: {
                name: string;
                attach: unknown;
              }) {
                expect(registration.name).toBe("logging");
                expect(typeof registration.attach).toBe("function");
              },
            },
          } as unknown as Parameters<
            NonNullable<CreateDaemonKernelOptions["initialize"]>
          >[0]);
          return {
            plugins: {
              core: {
                providers: {
                  async load() {
                    calls.push("load");
                  },
                },
              },
            },
            async dispose() {
              calls.push("dispose");
              getLogger(["comma", "daemon", "kernel"]).info("final diagnostic");
              if (failure === "dispose") {
                throw new Error("dispose");
              }
            },
          };
        },
      }));
      vi.doMock("../../daemon-server/index.ts", () => ({
        createDaemonServer({ daemon, host, port }: CreateDaemonServerOptions) {
          calls.push("server");
          expect(Object.keys(daemon.plugins)).toEqual(["core"]);
          expect({ host, port }).toEqual({ host: "127.0.0.1", port: 7422 });
          if (failure === "server") {
            throw new Error("server");
          }
          return {
            url: "ws://127.0.0.1:7422/ws",
            async start() {
              calls.push("start");
              if (failure === "start") {
                throw new Error("start");
              }
            },
            async stop() {
              calls.push("stop");
              if (failure === "stop") {
                throw new Error("stop");
              }
            },
          };
        },
      }));
      vi.doMock("../process/pid/pid.ts", () => ({
        writePid() {
          calls.push("pid");
          if (failure === "pid") {
            throw new Error("pid");
          }
        },
        removePid() {
          calls.push("remove");
        },
      }));
      const { startDaemonRuntime } = await import("./runtime");
      const config: DaemonConfig = {
        host: "127.0.0.1",
        port: 7422,
        runsDir: "runs-directory",
        pidFile: join(directory, "daemon.pid"),
        configFile: join(directory, "config.json"),
        modelRoles: {},
        instructionFiles: [],
        logLevel: "info",
        logFile: join(directory, "daemon.log"),
      };
      if (["kernel", "server", "start", "pid"].includes(failure)) {
        await expect(startDaemonRuntime(config)).rejects.toThrow(failure);
        expect(calls.includes("remove")).toBe(false);
      } else {
        const runtime = await startDaemonRuntime(config);
        const firstStop = runtime.stop();
        expect(runtime.stop()).toBe(firstStop);
        if (failure === "stop" || failure === "dispose") {
          await expect(firstStop).rejects.toThrow(failure);
        } else {
          await firstStop;
        }
        expect(calls).toEqual([
          "kernel",
          "server",
          "start",
          "load",
          "pid",
          "stop",
          "dispose",
          "remove",
        ]);
      }
      if (["server", "start", "pid"].includes(failure)) {
        expect(calls.filter((call) => call === "dispose")).toHaveLength(1);
      }
      if (["start", "pid"].includes(failure)) {
        expect(calls.indexOf("stop")).toBeLessThan(calls.indexOf("dispose"));
      }
      expect(getConfig()).toBeNull();
      expect(signals.map((signal) => process.listenerCount(signal))).toEqual(
        listeners,
      );
      const output = await readFile(config.logFile!, "utf8");
      if (
        ["none", "stop", "dispose", "server", "start", "pid"].includes(failure)
      ) {
        expect(output).toContain("final diagnostic");
      } else {
        expect(output).toContain("Failed to start daemon");
      }
    } finally {
      vi.doUnmock("../../daemon-kernel/index.ts");
      vi.doUnmock("../../daemon-server/index.ts");
      vi.doUnmock("../process/pid/pid.ts");
      vi.resetModules();
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
