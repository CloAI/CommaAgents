import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuditEntry } from "./audit";
import { sha256OfBuffer } from "./hash";
import {
  buildSessionFileState,
  verifySessionFileState,
} from "./session-file-state";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function entry(overrides: Partial<AuditEntry>): AuditEntry {
  return {
    timestamp: "2026-01-01T00:00:00.000Z",
    agentName: "agent",
    toolName: "write_file",
    operation: "update",
    path: "src/a.ts",
    success: true,
    ...overrides,
  } as AuditEntry;
}

describe("buildSessionFileState", () => {
  it("returns empty state for no entries", () => {
    expect(buildSessionFileState([]).size).toBe(0);
  });

  it("records create / update entries with afterSha256", () => {
    const state = buildSessionFileState([
      entry({ operation: "create", path: "a.ts", afterSha256: HASH_A }),
      entry({ operation: "update", path: "a.ts", afterSha256: HASH_B }),
    ]);

    expect(state.get("a.ts")).toEqual({
      path: "a.ts",
      sha256: HASH_B,
      deleted: false,
      stale: false,
    });
  });

  it("marks deleted entries with deleted: true", () => {
    const state = buildSessionFileState([
      entry({ operation: "create", path: "a.ts", afterSha256: HASH_A }),
      entry({ operation: "delete", path: "a.ts", beforeSha256: HASH_A }),
    ]);

    expect(state.get("a.ts")?.deleted).toBe(true);
    expect(state.get("a.ts")?.sha256).toBe(HASH_A);
  });

  it("handles move: removes source, upserts destination", () => {
    const state = buildSessionFileState([
      entry({ operation: "create", path: "old.ts", afterSha256: HASH_A }),
      entry({
        operation: "move",
        path: "old.ts",
        toPath: "new.ts",
        beforeSha256: HASH_A,
        afterSha256: HASH_A,
      }),
    ]);

    expect(state.has("old.ts")).toBe(false);
    expect(state.get("new.ts")).toEqual({
      path: "new.ts",
      sha256: HASH_A,
      deleted: false,
      stale: false,
    });
  });

  it("skips failed entries", () => {
    const state = buildSessionFileState([
      entry({ operation: "create", path: "a.ts", afterSha256: HASH_A }),
      entry({
        operation: "update",
        path: "a.ts",
        afterSha256: HASH_B,
        success: false,
        error: "boom",
      }),
    ]);

    expect(state.get("a.ts")?.sha256).toBe(HASH_A);
  });

  it("skips entries missing required hashes", () => {
    const state = buildSessionFileState([
      entry({ operation: "create", path: "a.ts" }), // no afterSha256
    ]);
    expect(state.has("a.ts")).toBe(false);
  });

  it("replays in order — last write wins", () => {
    const state = buildSessionFileState([
      entry({ operation: "create", path: "a.ts", afterSha256: HASH_A }),
      entry({ operation: "update", path: "a.ts", afterSha256: HASH_B }),
      entry({ operation: "update", path: "a.ts", afterSha256: HASH_C }),
    ]);
    expect(state.get("a.ts")?.sha256).toBe(HASH_C);
  });
});

describe("verifySessionFileState", () => {
  it("flags entries as stale when on-disk hash differs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfs-test-"));
    await writeFile(join(dir, "f.txt"), "actual contents");

    const original = buildSessionFileState([
      entry({
        operation: "create",
        path: "f.txt",
        afterSha256: "deadbeef".repeat(8), // wrong hash
      }),
    ]);

    const verified = await verifySessionFileState(original, (p) =>
      join(dir, p),
    );
    expect(verified.get("f.txt")?.stale).toBe(true);
  });

  it("does not flag entries when hash matches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfs-test-"));
    const content = "hello";
    await writeFile(join(dir, "f.txt"), content);

    const original = buildSessionFileState([
      entry({
        operation: "create",
        path: "f.txt",
        afterSha256: sha256OfBuffer(content),
      }),
    ]);

    const verified = await verifySessionFileState(original, (p) =>
      join(dir, p),
    );
    expect(verified.get("f.txt")?.stale).toBe(false);
  });

  it("flags missing files as stale", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfs-test-"));
    const original = buildSessionFileState([
      entry({
        operation: "create",
        path: "missing.txt",
        afterSha256: HASH_A,
      }),
    ]);

    const verified = await verifySessionFileState(original, (p) =>
      join(dir, p),
    );
    expect(verified.get("missing.txt")?.stale).toBe(true);
  });

  it("skips deleted entries (they cannot be stale)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfs-test-"));
    const original = buildSessionFileState([
      entry({ operation: "create", path: "f.txt", afterSha256: HASH_A }),
      entry({ operation: "delete", path: "f.txt", beforeSha256: HASH_A }),
    ]);

    const verified = await verifySessionFileState(original, (p) =>
      join(dir, p),
    );
    expect(verified.get("f.txt")?.stale).toBe(false);
    expect(verified.get("f.txt")?.deleted).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});
