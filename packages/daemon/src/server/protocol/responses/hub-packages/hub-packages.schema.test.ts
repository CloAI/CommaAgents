import { describe, expect, it } from "vitest";

import { parseDaemonMessage } from "../../messages";

describe("Hub package responses", () => {
  it("parses package list and mutation results", () => {
    expect(
      parseDaemonMessage({
        type: "hub_packages",
        operation: "list",
        available: [],
        installed: [],
        ts: new Date().toISOString(),
      }).success,
    ).toBe(true);
    expect(
      parseDaemonMessage({
        type: "hub_packages",
        operation: "remove",
        removed: true,
        ts: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
});
