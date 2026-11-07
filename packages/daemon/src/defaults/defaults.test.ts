import { afterEach, describe, expect, test } from "vitest";

import {
  getDaemonDefaults,
  getDaemonLogLevel,
  getDaemonPort,
  resetDaemonDefaultOverrides,
  setDaemonLogLevel,
  setDaemonPort,
} from "./defaults";

afterEach(resetDaemonDefaultOverrides);

describe("getDaemonDefaults", () => {
  test("returns process-environment defaults", () => {
    expect(getDaemonDefaults()).toMatchObject({
      port: 7422,
      host: "127.0.0.1",
      logLevel: "info",
      logFile: expect.stringContaining("daemon.log"),
      pidFile: expect.stringContaining("daemon.pid"),
      configFile: expect.stringContaining("daemon.json"),
      runsDir: expect.stringContaining("runs"),
    });
  });
});

describe("daemonDefaultOverrides", () => {
  test("take precedence over environment and resolved configuration", () => {
    setDaemonPort(9100);
    setDaemonLogLevel("debug");

    expect(getDaemonPort()).toBe(9100);
    expect(getDaemonLogLevel()).toBe("debug");
  });
});
