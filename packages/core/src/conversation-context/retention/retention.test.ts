import { describe, expect, it } from "bun:test";
import { prepareContextRecords } from "./retention";
import { activeRecords } from "./retention.utils";
import { countingSummarizer, makeRecord } from "./test.utils";

describe("activeRecords", () => {
  it("should drop superseded records only", () => {
    const records = [
      makeRecord("1", { status: "superseded" }),
      makeRecord("2"),
      makeRecord("3", { status: "active" }),
    ];

    expect(activeRecords(records).map((record) => record.id)).toEqual([
      "2",
      "3",
    ]);
  });
});

describe("prepareContextRecords", () => {
  it("should apply compaction, rolling, and custom transforms in order", async () => {
    const { summarize } = countingSummarizer();
    const records = [1, 2, 3, 4, 5].map((index) => makeRecord(String(index)));

    const result = await prepareContextRecords(
      {
        compaction: { keepRecent: 2, threshold: 4, summarize },
        rollingWindow: 2,
        transformRecords: ({ records: transformedRecords }) => [
          ...transformedRecords,
          makeRecord("custom"),
        ],
      },
      { records, agentName: "writer" },
    );

    expect(
      activeRecords(result.records).map((record) => record.id),
    ).toHaveLength(3);
    expect(activeRecords(result.records).at(-1)?.id).toBe("custom");
    expect(result.events).toHaveLength(1);
  });
});
