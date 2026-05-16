// Tests for platform utilities.

import { describe, expect, it } from "bun:test";
import { isLinux, isSystemd } from "./platform";

describe("isLinux", () => {
  it("should return a boolean", () => {
    const result = isLinux();
    expect(typeof result).toBe("boolean");
  });

  it("should match process.platform", () => {
    expect(isLinux()).toBe(process.platform === "linux");
  });
});

describe("isSystemd", () => {
  it("should return a boolean", () => {
    const result = isSystemd();
    expect(typeof result).toBe("boolean");
  });

  it("should detect based on JOURNAL_STREAM or INVOCATION_ID", () => {
    // On non-systemd environments (macOS, CI), this should be false
    const expected = !!(
      process.env.JOURNAL_STREAM || process.env.INVOCATION_ID
    );
    expect(isSystemd()).toBe(expected);
  });
});
