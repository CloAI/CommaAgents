// Integration tests for the file-backed SessionStore.
//
// Each test uses a fresh temp directory so writes don't collide.

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionStore } from "./sessions";
import type { SessionRunSummary, SessionTurn } from "./sessions.types";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best effort.
    }
  }
  tempRoots.length = 0;
});

function newStore(): {
  store: ReturnType<typeof createSessionStore>;
  sessionsDir: string;
} {
  const sessionsDir = mkdtempSync(join(tmpdir(), "session-store-"));
  tempRoots.push(sessionsDir);
  return { store: createSessionStore({ sessionsDir }), sessionsDir };
}

function turnFor(runId: string, agentName: string, text: string): SessionTurn {
  const now = new Date().toISOString();
  return {
    runId,
    strategyName: "Test",
    agentName,
    startedAt: now,
    completedAt: now,
    text,
    usage: { promptTokens: 1, completionTokens: 2 },
    finishReason: "stop",
    userMessage: "hello",
    responseMessages: [],
  };
}

function runFor(
  runId: string,
  status: SessionRunSummary["status"],
): SessionRunSummary {
  const now = new Date().toISOString();
  return {
    runId,
    strategyName: "Test",
    strategyPath: "/strategy.json",
    startedAt: now,
    completedAt: status === "running" || status === "pending" ? null : now,
    status,
  };
}

describe("createSessionStore", () => {
  describe("getOrCreateForCwd", () => {
    it("creates a new session for a fresh cwd", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const session = await store.getOrCreateForCwd(cwd);
      expect(session.metadata.id).toBeDefined();
      expect(session.metadata.title).toBe(session.metadata.id);
      expect(session.metadata.cwd).toBe(realpathSync(cwd));
      expect(session.metadata.cwdHash).toMatch(/^[0-9a-f]{16}$/);
      expect(session.turns).toHaveLength(0);
      expect(session.runs).toHaveLength(0);
    });

    it("returns the same session for the same cwd on subsequent calls", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const first = await store.getOrCreateForCwd(cwd);
      const second = await store.getOrCreateForCwd(cwd);
      expect(second.metadata.id).toBe(first.metadata.id);
    });

    it("creates separate sessions for different cwds", async () => {
      const { store } = newStore();
      const a = mkdtempSync(join(tmpdir(), "cwd-a-"));
      const b = mkdtempSync(join(tmpdir(), "cwd-b-"));
      tempRoots.push(a, b);

      const sessionA = await store.getOrCreateForCwd(a);
      const sessionB = await store.getOrCreateForCwd(b);
      expect(sessionA.metadata.id).not.toBe(sessionB.metadata.id);
      expect(sessionA.metadata.cwdHash).not.toBe(sessionB.metadata.cwdHash);
    });
  });

  describe("getOrCreateForCwdSync", () => {
    it("matches the async variant", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const sync = store.getOrCreateForCwdSync(cwd);
      const async = await store.getOrCreateForCwd(cwd);
      expect(async.metadata.id).toBe(sync.metadata.id);
    });
  });

  describe("appendTurn", () => {
    it("appends turns in order", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const { metadata } = await store.getOrCreateForCwd(cwd);
      await store.appendTurn(metadata.id, turnFor("run-1", "writer", "first"));
      await store.appendTurn(
        metadata.id,
        turnFor("run-1", "reviewer", "second"),
      );

      const reloaded = await store.load(metadata.id);
      expect(reloaded?.turns.map((turn) => turn.text)).toEqual([
        "first",
        "second",
      ]);
    });

    it("rejects unknown sessions", async () => {
      const { store } = newStore();
      let caught: unknown = null;
      try {
        await store.appendTurn("missing", turnFor("r", "a", "t"));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
    });
  });

  describe("recordRun", () => {
    it("upserts by runId so initial running can be replaced by completed", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const { metadata } = await store.getOrCreateForCwd(cwd);
      await store.recordRun(metadata.id, runFor("run-1", "running"));
      await store.recordRun(metadata.id, runFor("run-1", "completed"));

      const reloaded = await store.load(metadata.id);
      expect(reloaded?.runs).toHaveLength(1);
      expect(reloaded?.runs[0]?.status).toBe("completed");
    });
  });

  describe("list", () => {
    it("returns metadata for all sessions", async () => {
      const { store } = newStore();
      const a = mkdtempSync(join(tmpdir(), "list-a-"));
      const b = mkdtempSync(join(tmpdir(), "list-b-"));
      tempRoots.push(a, b);
      await store.getOrCreateForCwd(a);
      await store.getOrCreateForCwd(b);

      const list = await store.list();
      expect(list).toHaveLength(2);
    });

    it("filters by cwd when provided", async () => {
      const { store } = newStore();
      const a = mkdtempSync(join(tmpdir(), "list-a-"));
      const b = mkdtempSync(join(tmpdir(), "list-b-"));
      tempRoots.push(a, b);
      const sessionA = await store.getOrCreateForCwd(a);
      await store.getOrCreateForCwd(b);

      const filtered = await store.list({ cwd: sessionA.metadata.cwd });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe(sessionA.metadata.id);
    });
  });

  describe("rename", () => {
    it("updates the title and returns the new metadata", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const { metadata } = await store.getOrCreateForCwd(cwd);
      const updated = await store.rename(metadata.id, "My Session");
      expect(updated.title).toBe("My Session");

      const reloaded = await store.load(metadata.id);
      expect(reloaded?.metadata.title).toBe("My Session");
    });

    it("resets the title to the session id when title is null", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const { metadata } = await store.getOrCreateForCwd(cwd);
      await store.rename(metadata.id, "Renamed");
      const reset = await store.rename(metadata.id, null);
      expect(reset.title).toBe(metadata.id);
    });
  });

  describe("delete", () => {
    it("removes the session and returns true", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const { metadata } = await store.getOrCreateForCwd(cwd);
      const deleted = await store.delete(metadata.id);
      expect(deleted).toBe(true);
      expect(await store.load(metadata.id)).toBeNull();
    });

    it("returns false for unknown sessions", async () => {
      const { store } = newStore();
      expect(await store.delete("missing")).toBe(false);
    });

    it("creates a fresh session for the same cwd after delete", async () => {
      const { store } = newStore();
      const cwd = mkdtempSync(join(tmpdir(), "cwd-"));
      tempRoots.push(cwd);

      const first = await store.getOrCreateForCwd(cwd);
      await store.delete(first.metadata.id);
      const second = await store.getOrCreateForCwd(cwd);
      expect(second.metadata.id).not.toBe(first.metadata.id);
    });
  });
});
