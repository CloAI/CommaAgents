import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuditEntry } from "./audit";
import { createFileAuditSink, createMemoryAuditSink } from "./audit-sink";

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    agentName: "test-agent",
    toolName: "write_file",
    operation: "update",
    path: "src/a.ts",
    beforeSha256: "a".repeat(64),
    afterSha256: "b".repeat(64),
    success: true,
    ...overrides,
  };
}

describe("createMemoryAuditSink", () => {
  it("appends and lists entries in insertion order", async () => {
    const sink = createMemoryAuditSink();
    await sink.append(makeEntry({ path: "a" }));
    await sink.append(makeEntry({ path: "b" }));
    const all = await sink.list();
    expect(all.map((entry) => entry.path)).toEqual(["a", "b"]);
  });

  it("filters by sessionId on list", async () => {
    const sink = createMemoryAuditSink();
    await sink.append(makeEntry({ sessionId: "s1", path: "a" }));
    await sink.append(makeEntry({ sessionId: "s2", path: "b" }));
    await sink.append(makeEntry({ sessionId: "s1", path: "c" }));

    const session1 = await sink.list("s1");
    expect(session1.map((entry) => entry.path)).toEqual(["a", "c"]);
  });

  it("load is equivalent to list(sessionId)", async () => {
    const sink = createMemoryAuditSink();
    await sink.append(makeEntry({ sessionId: "s1", path: "a" }));
    expect(await sink.load("s1")).toEqual(await sink.list("s1"));
  });

  it("returns a defensive copy from list()", async () => {
    const sink = createMemoryAuditSink();
    await sink.append(makeEntry());
    const first = await sink.list();
    const second = await sink.list();
    expect(first).not.toBe(second);
  });
});

describe("createFileAuditSink", () => {
  it("appends entries as JSONL and reloads them", async () => {
    const root = await mkdtemp(join(tmpdir(), "audit-sink-"));
    const sink = createFileAuditSink(root);

    await sink.append(makeEntry({ sessionId: "abc", path: "a" }));
    await sink.append(makeEntry({ sessionId: "abc", path: "b" }));

    const loaded = await sink.load("abc");
    expect(loaded.map((entry) => entry.path)).toEqual(["a", "b"]);

    // Inspect the file directly
    const raw = await readFile(
      join(root, ".comma", "audit", "abc.jsonl"),
      "utf8",
    );
    expect(raw.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("routes sessionId-less entries to default.jsonl", async () => {
    const root = await mkdtemp(join(tmpdir(), "audit-sink-"));
    const sink = createFileAuditSink(root);

    await sink.append(makeEntry({ path: "x" }));
    const all = await sink.list();
    expect(all.map((entry) => entry.path)).toEqual(["x"]);

    const raw = await readFile(
      join(root, ".comma", "audit", "default.jsonl"),
      "utf8",
    );
    expect(JSON.parse(raw.trim())).toMatchObject({ path: "x" });
  });

  it("truncates oversize diffs", async () => {
    const root = await mkdtemp(join(tmpdir(), "audit-sink-"));
    const sink = createFileAuditSink(root, { maxDiffBytes: 32 });

    await sink.append(
      makeEntry({
        sessionId: "abc",
        diff: "x".repeat(1000),
      }),
    );

    const [entry] = await sink.load("abc");
    expect(entry?.diff?.length).toBeLessThan(200);
    expect(entry?.diff).toContain("…(truncated");
  });

  it("returns [] for an unknown session", async () => {
    const root = await mkdtemp(join(tmpdir(), "audit-sink-"));
    const sink = createFileAuditSink(root);
    expect(await sink.load("missing")).toEqual([]);
    expect(await sink.list()).toEqual([]);
  });

  it("list() merges all session files", async () => {
    const root = await mkdtemp(join(tmpdir(), "audit-sink-"));
    const sink = createFileAuditSink(root);

    await sink.append(makeEntry({ sessionId: "s1", path: "a" }));
    await sink.append(makeEntry({ sessionId: "s2", path: "b" }));
    await sink.append(makeEntry({ path: "c" })); // → default.jsonl

    const all = await sink.list();
    expect(all.map((entry) => entry.path).sort()).toEqual(["a", "b", "c"]);
  });
});
