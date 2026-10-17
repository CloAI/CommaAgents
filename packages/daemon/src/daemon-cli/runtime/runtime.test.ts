import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each subprocess owns its module mocks and process-global logging configuration.
// This keeps lifecycle tests independent of both core providers and other suites.
for (const failure of [
  "none",
  "hydrate",
  "construct",
  "start",
  "stop",
] as const) {
  test(`runtime releases logging and handlers (${failure})`, async () => {
    const directory = mkdtempSync(join(tmpdir(), "comma-runtime-logging-"));
    try {
      const script = `
        import { mock, expect } from "bun:test";
        import { getConfig, getLogger } from ${JSON.stringify(import.meta.resolve("@logtape/logtape"))};
        const failure = ${JSON.stringify(failure)};
        let stops = 0;
        let writes = 0;
        let removals = 0;
        const signals = ["uncaughtException", "unhandledRejection", "SIGINT", "SIGTERM"];
        const listeners = signals.map((signal) => process.listenerCount(signal));
        mock.module(${JSON.stringify(new URL("./runtime.utils.ts", import.meta.url).pathname)}, () => ({
          async hydrateRegisteredProviders() { if (failure === "hydrate") throw new Error("hydrate"); },
        }));
        mock.module(${JSON.stringify(new URL("../../server/createDaemon.ts", import.meta.url).pathname)}, () => ({
          createDaemon() {
            if (failure === "construct") throw new Error("construct");
            return {
              async start() { if (failure === "start") throw new Error("start"); },
              async stop() {
                stops++;
                getLogger(["comma", "daemon", "server"]).info("final diagnostic");
                if (failure === "stop") throw new Error("stop");
              },
            };
          },
        }));
        mock.module(${JSON.stringify(new URL("../process/pid/pid.ts", import.meta.url).pathname)}, () => ({
          writePid() { writes++; },
          removePid() { removals++; },
        }));
        const { startDaemonRuntime } = await import(${JSON.stringify(new URL("./runtime.ts", import.meta.url).pathname)});
        const config = { logLevel: "info", logFile: ${JSON.stringify(join(directory, "daemon.log"))} };
        if (["hydrate", "construct", "start"].includes(failure)) {
          await expect(startDaemonRuntime(config)).rejects.toThrow(failure);
          expect(writes).toBe(0);
        } else {
          const runtime = await startDaemonRuntime(config);
          const firstStop = runtime.stop();
          expect(runtime.stop()).toBe(firstStop);
          if (failure === "stop") await expect(firstStop).rejects.toThrow("stop");
          else await firstStop;
          expect(stops).toBe(1);
          expect(writes).toBe(1);
          expect(removals).toBe(1);
        }
        expect(getConfig()).toBeNull();
        expect(signals.map((signal) => process.listenerCount(signal))).toEqual(listeners);
        const output = await Bun.file(config.logFile).text();
        if (["none", "stop", "start"].includes(failure)) expect(output).toContain("final diagnostic");
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
