import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunHistoryStorage } from "./storage";
import { readHistoryIndex } from "./storage.utils";
import type { CompletedAgentMessage } from "../../messages/messages.types";
import { RunMessageStatus } from "../../messages/messages.schemas";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), "run-history-"));
  directories.push(path);
  return path;
}

function message(
  messageId: string,
  runId = "conversation",
): CompletedAgentMessage {
  return {
    type: "message",
    messageId,
    runId,
    role: "agent",
    agentName: "writer",
    createdAt: new Date().toISOString(),
    status: RunMessageStatus.completed,
    content: [{ type: "text", text: messageId }],
  };
}

describe("createRunHistoryStorage", () => {
  it("should page backward without offsets shifting when new messages arrive", async () => {
    const storage = createRunHistoryStorage(directory());
    for (let messageIndex = 0; messageIndex < 65; messageIndex++) {
      await storage.save(message(String(messageIndex)));
    }
    const newest = await storage.read("conversation", { limit: 25 });
    expect(newest.entries.map((entry) => entry.messageId)).toEqual(
      Array.from({ length: 25 }, (_, index) => String(index + 40)),
    );
    for (let messageIndex = 65; messageIndex < 70; messageIndex++) {
      await storage.save(message(String(messageIndex)));
    }
    const older = await storage.read("conversation", {
      limit: 25,
      before: newest.page.before,
    });
    expect(older.entries.map((entry) => entry.messageId)).toEqual(
      Array.from({ length: 25 }, (_, index) => String(index + 15)),
    );
    const oldest = await storage.read("conversation", {
      limit: 25,
      before: older.page.before,
    });
    expect(oldest.entries.map((entry) => entry.messageId)).toEqual(
      Array.from({ length: 15 }, (_, index) => String(index)),
    );
    expect(oldest.page).toEqual({ hasMore: false });
    expect((await storage.read("conversation")).entries.length).toBe(70);
  });

  it("should retain creation positions while active messages finish and survive restart", async () => {
    const path = directory();
    const storage = createRunHistoryStorage(path);
    await storage.reserve("conversation", "first");
    await storage.save(message("second"));
    expect(
      (await storage.read("conversation")).entries.map(
        (entry) => entry.messageId,
      ),
    ).toEqual(["second"]);
    await storage.save({
      ...message("first"),
      status: RunMessageStatus.stopped,
    });
    const reopened = createRunHistoryStorage(path);
    expect(
      (await reopened.read("conversation")).entries.map(
        (entry) => entry.messageId,
      ),
    ).toEqual(["first", "second"]);
    expect(
      (await reopened.read("conversation", { limit: 1 })).entries[0]?.messageId,
    ).toBe("second");
  });

  it("should reject invalid and cross-conversation cursors", async () => {
    const storage = createRunHistoryStorage(directory());
    await storage.save(message("one"));
    await storage.save(message("two"));
    const page = await storage.read("conversation", { limit: 1 });
    await expect(
      storage.read("other", { before: page.page.before }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(
      storage.read("conversation", { before: "invalid" }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    await expect(
      storage.read("conversation", { limit: 0 }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });

  it("should scan index rows across buffer boundaries without loading a complete index", () => {
    const path = join(directory(), "index.jsonl");
    const identities = Array.from({ length: 5000 }, () => crypto.randomUUID());
    writeFileSync(
      path,
      `${identities.map((identity) => JSON.stringify(identity)).join("\n")}\n`,
    );
    const length = Buffer.byteLength(
      `${identities.map((identity) => JSON.stringify(identity)).join("\n")}\n`,
    );
    const rows = [...readHistoryIndex(path, length)];
    expect(rows.map((row) => row.messageId)).toEqual(identities.toReversed());
    expect(rows.at(-1)?.position).toBe(0);
  });
});
