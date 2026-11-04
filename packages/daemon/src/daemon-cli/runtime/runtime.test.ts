import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Subprocesses isolate module mocks, logging, and process signal handlers.
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
    const directory = mkdtempSync(join(tmpdir(), "comma-runtime-logging-"));
    try {
      const script = `
        import { mock, expect } from "bun:test";
        import { getConfig, getLogger } from ${JSON.stringify(import.meta.resolve("@logtape/logtape"))};
        const failure = ${JSON.stringify(failure)};
        const calls = [];
        const signals = ["uncaughtException", "unhandledRejection", "SIGINT", "SIGTERM"];
        const listeners = signals.map((signal) => process.listenerCount(signal));
        mock.module(${JSON.stringify(new URL("../../daemon-kernel/index.ts", import.meta.url).pathname)}, () => ({
          async createDaemonKernel({ runs, initialize }) {
            calls.push("kernel");
            expect(runs.runsDir).toBe("runs-directory");
            if (failure === "kernel") throw new Error("kernel");
            await initialize?.({ runs: { registerRunPreparation(registration) {
              expect(registration.name).toBe("privacy");
              expect(typeof registration.prepare).toBe("function");
            }, registerStrategyHooks(registration) {
              expect(registration.name).toBe("logging");
              expect(typeof registration.attach).toBe("function");
            } } });
            return { plugins: { core: { providers: { async load() { calls.push("load"); } } } }, async dispose() {
              calls.push("dispose");
              getLogger(["comma", "daemon", "kernel"]).info("final diagnostic");
              if (failure === "dispose") throw new Error("dispose");
            } };
          },
        }));
        mock.module(${JSON.stringify(new URL("../../daemon-server/index.ts", import.meta.url).pathname)}, () => ({
          createDaemonServer({ daemon, host, port }) {
            calls.push("server");
            expect(Object.keys(daemon.plugins)).toEqual(["core"]);
            expect({ host, port }).toEqual({ host: "127.0.0.1", port: 7422 });
            if (failure === "server") throw new Error("server");
            return { url: "ws://127.0.0.1:7422/ws",
              async start() { calls.push("start"); if (failure === "start") throw new Error("start"); },
              async stop() { calls.push("stop"); if (failure === "stop") throw new Error("stop"); },
            };
          },
        }));
        mock.module(${JSON.stringify(new URL("../process/pid/pid.ts", import.meta.url).pathname)}, () => ({
          writePid() { calls.push("pid"); if (failure === "pid") throw new Error("pid"); },
          removePid() { calls.push("remove"); },
        }));
        const { startDaemonRuntime } = await import(${JSON.stringify(new URL("./runtime.ts", import.meta.url).pathname)});
        const config = { host: "127.0.0.1", port: 7422, runsDir: "runs-directory", logLevel: "info", logFile: ${JSON.stringify(join(directory, "daemon.log"))} };
        if (["kernel", "server", "start", "pid"].includes(failure)) {
          await expect(startDaemonRuntime(config)).rejects.toThrow(failure);
          expect(calls.includes("remove")).toBe(false);
        } else {
          const runtime = await startDaemonRuntime(config);
          const firstStop = runtime.stop();
          expect(runtime.stop()).toBe(firstStop);
          if (failure === "stop" || failure === "dispose") await expect(firstStop).rejects.toThrow(failure);
          else await firstStop;
          expect(calls).toEqual(["kernel", "server", "start", "load", "pid", "stop", "dispose", "remove"]);
        }
        if (["server", "start", "pid"].includes(failure)) expect(calls.filter((call) => call === "dispose")).toHaveLength(1);
        if (["start", "pid"].includes(failure)) expect(calls.indexOf("stop")).toBeLessThan(calls.indexOf("dispose"));
        expect(getConfig()).toBeNull();
        expect(signals.map((signal) => process.listenerCount(signal))).toEqual(listeners);
        const output = await Bun.file(config.logFile).text();
        if (["none", "stop", "dispose", "server", "start", "pid"].includes(failure)) expect(output).toContain("final diagnostic");
        else expect(output).toContain("Failed to start daemon");
      `;
      const child = Bun.spawn([process.execPath, "--eval", script], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      expect({ code, error: code === 0 ? "" : stderr }).toEqual({
        code: 0,
        error: "",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
