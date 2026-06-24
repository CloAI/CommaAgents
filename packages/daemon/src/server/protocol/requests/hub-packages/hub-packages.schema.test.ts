import { describe, expect, it } from "bun:test";

import { parseClientMessage } from "../../messages";

describe("Hub package requests", () => {
  it("parses list, install, update, and remove messages", () => {
    expect(parseClientMessage({ type: "hub_list" }).success).toBe(true);
    expect(
      parseClientMessage({
        type: "hub_install",
        name: "@comma/core-strategies",
        allowCode: true,
      }).success,
    ).toBe(true);
    expect(
      parseClientMessage({ type: "hub_update", name: "@comma/core-strategies" })
        .success,
    ).toBe(true);
    expect(
      parseClientMessage({ type: "hub_remove", name: "@comma/core-strategies" })
        .success,
    ).toBe(true);
  });

  it("rejects mutations without a package name", () => {
    expect(parseClientMessage({ type: "hub_install" }).success).toBe(false);
  });
});
