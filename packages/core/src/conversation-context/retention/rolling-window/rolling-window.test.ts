import { describe, expect, it } from "bun:test";
import { makeRecord } from "../test.utils";
import { applyRollingWindow } from "./rolling-window";

describe("applyRollingWindow", () => {
  it("should supersede the oldest records beyond the window", () => {
    const records = [
      makeRecord("1"),
      makeRecord("2"),
      makeRecord("3"),
      makeRecord("4"),
    ];

    const next = applyRollingWindow(records, { maxRecords: 2 });

    expect(
      next
        .filter((record) => record.status !== "superseded")
        .map((record) => record.id),
    ).toEqual(["3", "4"]);
    expect(next).toHaveLength(4);
    expect(next[0]).toMatchObject({ id: "1", status: "superseded" });
    expect(next[1]).toMatchObject({ id: "2", status: "superseded" });
  });

  it("should ignore already-superseded records when measuring the window", () => {
    const records = [
      makeRecord("1", { status: "superseded" }),
      makeRecord("2"),
      makeRecord("3"),
    ];

    const next = applyRollingWindow(records, { maxRecords: 1 });

    expect(
      next
        .filter((record) => record.status !== "superseded")
        .map((record) => record.id),
    ).toEqual(["3"]);
    expect(next[1]).toMatchObject({ id: "2", status: "superseded" });
  });
});
