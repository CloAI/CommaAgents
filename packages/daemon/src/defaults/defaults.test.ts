import { afterEach, describe, expect, test } from "vitest";

import {
  getDaemonLogLevel,
  getDaemonPort,
  resetDaemonDefaultOverrides,
  setDaemonLogLevel,
  setDaemonPort,
} from "./defaults";

afterEach(resetDaemonDefaultOverrides);

describe("daemonDefaultOverrides", () => {
  test("take precedence over environment and resolved configuration", () => {
    setDaemonPort(9100);
    setDaemonLogLevel("debug");

    expect(getDaemonPort()).toBe(9100);
    expect(getDaemonLogLevel()).toBe("debug");
  });
});
