// Tests for shared protocol base envelopes.

import { describe, expect, test } from "bun:test";
import { ClientBase, DaemonBase } from "./shared";

// ClientBase

describe("ClientBase", () => {
  test("accepts empty object", () => {
    expect(ClientBase.parse({})).toEqual({});
  });

  test("accepts requestId", () => {
    const result = ClientBase.parse({ requestId: "req-1" });
    expect(result.requestId).toBe("req-1");
  });

  test("strips unknown fields", () => {
    const result = ClientBase.parse({ requestId: "req-1", extra: true });
    expect(result).toEqual({ requestId: "req-1" });
  });
});

// DaemonBase

describe("DaemonBase", () => {
  const ts = "2026-03-01T12:00:00.000Z";

  test("requires ts as ISO datetime", () => {
    expect(DaemonBase.parse({ ts })).toEqual({ ts });
  });

  test("accepts requestId + ts", () => {
    const result = DaemonBase.parse({ requestId: "req-2", ts });
    expect(result).toEqual({ requestId: "req-2", ts });
  });

  test("rejects missing ts", () => {
    expect(DaemonBase.safeParse({}).success).toBe(false);
  });

  test("rejects non-ISO ts", () => {
    expect(DaemonBase.safeParse({ ts: "not-a-date" }).success).toBe(false);
  });

  test("rejects ts without time zone", () => {
    // datetime() requires a timezone offset
    expect(DaemonBase.safeParse({ ts: "2026-03-01T12:00:00" }).success).toBe(false);
  });
});
