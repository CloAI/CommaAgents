import { describe, expect, it } from "bun:test";
import type { ConversationRecord } from "../../conversation-context.types";
import { activeRecords } from "../retention.utils";
import { countingSummarizer, makeRecord } from "../test.utils";
import { applyCompaction } from "./compaction";

describe("applyCompaction", () => {
  it("should fold older records into one summary once over the threshold", async () => {
    const { calls, summarize } = countingSummarizer();
    const records = [1, 2, 3, 4, 5].map((index) => makeRecord(String(index)));

    const next = await applyCompaction(
      records,
      { keepRecent: 2, threshold: 4, summarize },
      "writer",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.map((record) => record.id)).toEqual(["1", "2", "3"]);
    expect(activeRecords(next).map((record) => record.text)).toEqual([
      "summary-of-1+2+3",
      "a-4",
      "a-5",
    ]);
    expect(
      next
        .filter((record) => record.status === "superseded")
        .map((record) => record.id),
    ).toEqual(["1", "2", "3"]);
  });

  it("should not re-summarize until the tail regrows past the threshold", async () => {
    const { calls, summarize } = countingSummarizer();
    let records: readonly ConversationRecord[] = [1, 2, 3, 4, 5].map((index) =>
      makeRecord(String(index)),
    );

    records = await applyCompaction(
      records,
      { keepRecent: 2, threshold: 4, summarize },
      "writer",
    );
    expect(calls).toHaveLength(1);

    records = await applyCompaction(
      records,
      { keepRecent: 2, threshold: 4, summarize },
      "writer",
    );
    expect(calls).toHaveLength(1);

    await applyCompaction(
      [...records, makeRecord("6"), makeRecord("7")],
      { keepRecent: 2, threshold: 4, summarize },
      "writer",
    );
    expect(calls).toHaveLength(2);
  });

  it("should require a summarizer when compaction runs", async () => {
    await expect(
      applyCompaction(
        [makeRecord("1"), makeRecord("2"), makeRecord("3")],
        {
          keepRecent: 1,
          threshold: 2,
        },
        "writer",
      ),
    ).rejects.toThrow(/summarize/);
  });
});
