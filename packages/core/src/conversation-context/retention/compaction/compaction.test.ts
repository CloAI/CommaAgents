import { describe, expect, it } from "bun:test";
import type { ConversationRecord } from "../../conversation-context.types";
import { activeRecords } from "../retention.utils";
import { countingSummarizer, makeRecord } from "../test.utils";
import { applyCompaction } from "./compaction";

describe("applyCompaction", () => {
  it("should fold older records into one summary once over the threshold", async () => {
    const { calls, summarize } = countingSummarizer();
    const records = [1, 2, 3, 4, 5].map((index) => makeRecord(String(index)));

    const result = await applyCompaction({
      records,
      options: { keepRecent: 2, threshold: 4, summarize },
      agentName: "writer",
      trigger: {},
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.map((record) => record.id)).toEqual(["1", "2", "3"]);
    expect(activeRecords(result.records).map((record) => record.text)).toEqual([
      "summary-of-1+2+3",
      "a-4",
      "a-5",
    ]);
    expect(
      result.records
        .filter((record) => record.status === "superseded")
        .map((record) => record.id),
    ).toEqual(["1", "2", "3"]);
    expect(result.event).toMatchObject({
      agentName: "writer",
      kind: "compaction",
      reason: "record-count",
      recordsCompacted: 3,
      recordsRetained: 2,
      supersededRecordIds: ["1", "2", "3"],
    });
  });

  it("should not re-summarize until the tail regrows past the threshold", async () => {
    const { calls, summarize } = countingSummarizer();
    let records: readonly ConversationRecord[] = [1, 2, 3, 4, 5].map((index) =>
      makeRecord(String(index)),
    );

    records = (
      await applyCompaction({
        records,
        options: { keepRecent: 2, threshold: 4, summarize },
        agentName: "writer",
        trigger: {},
      })
    ).records;
    expect(calls).toHaveLength(1);

    records = (
      await applyCompaction({
        records,
        options: { keepRecent: 2, threshold: 4, summarize },
        agentName: "writer",
        trigger: {},
      })
    ).records;
    expect(calls).toHaveLength(1);

    await applyCompaction({
      records: [...records, makeRecord("6"), makeRecord("7")],
      options: { keepRecent: 2, threshold: 4, summarize },
      agentName: "writer",
      trigger: {},
    });
    expect(calls).toHaveLength(2);
  });

  it("should require a summarizer when compaction runs", async () => {
    await expect(
      applyCompaction({
        records: [makeRecord("1"), makeRecord("2"), makeRecord("3")],
        options: {
          keepRecent: 1,
          threshold: 2,
        },
        agentName: "writer",
        trigger: {},
      }),
    ).rejects.toThrow(/summarize/);
  });

  it("should compact when context usage passes the threshold ratio", async () => {
    const { summarize } = countingSummarizer();
    const records = [1, 2, 3, 4, 5].map((index) => makeRecord(String(index)));

    const result = await applyCompaction({
      records,
      options: { keepRecent: 2, summarize },
      agentName: "writer",
      trigger: {
        model: "mock/windowed",
        contextUsage: { totalTokens: 850 },
        contextWindow: 1_000,
        tokenLimit: 1_000,
      },
    });

    expect(result.event?.reason).toBe("context-window");
    expect(result.event?.trigger).toMatchObject({
      model: "mock/windowed",
      contextUsage: { totalTokens: 850 },
      contextWindow: 1_000,
      tokenLimit: 1_000,
      ratio: 0.85,
      thresholdRatio: 0.85,
    });
  });
});
