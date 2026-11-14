import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  readFileSync,
  renameSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  cleanupRunFixtures,
  createMockRunsPlugin,
  directories,
  fakeLoader,
  createRunDirectory,
} from "../test.utils";
import { createRunsPlugin } from "../runs";
import { createDaemonServer } from "../../../daemon-server";
import { connectSocket } from "../../../daemon-server/test.utils";

afterEach(cleanupRunFixtures);

function fixture() {
  return createMockRunsPlugin({
    runsDir: createRunDirectory(),
    loadStrategy: fakeLoader({ loads: [], restored: [] }),
  });
}

describe("independent conversation copies", () => {
  it("should freeze the full delegated tree, remap ownership, and restore it after restart", async () => {
    const runs = fixture();
    await runs.prepareRun({
      runId: "original",
      configuration: { strategyPath: "example.json", cwd: "/source" },
    });
    expect(await runs.startRun("original", "nested").completion).toMatchObject({
      status: "completed",
    });
    const checkpoint = await runs.getCopyCheckpoint("original");
    expect(checkpoint?.completedAt).toBeInstanceOf(Date);
    expect(checkpoint?.runIds).toHaveLength(3);
    const copied = await runs.copyRun({
      runId: "original",
      targetRunId: "copied",
      cwd: "/destination",
      checkpointId: checkpoint!.checkpointId,
    });
    expect(copied.runIds).toHaveLength(3);
    expect(
      copied.runIds.every((runId) => !checkpoint!.runIds.includes(runId)),
    ).toBe(true);
    const copiedHistory = await runs.getHistory("copied");
    const child = copiedHistory.entries.find(
      (entry) => entry.type === "child.run",
    );
    expect(child?.type).toBe("child.run");
    if (child?.type !== "child.run") {
      throw new Error("Missing copied child");
    }
    expect(child.messageId).toBe(child.childRunId);
    expect((await runs.getRun(child.childRunId))?.parentRunId).toBe("copied");
    for (const runId of copied.runIds) {
      expect((await runs.getRun(runId))?.configuration.cwd).toBe(
        "/destination",
      );
      expect((await runs.getHistory(runId)).entries.length).toBeGreaterThan(0);
    }
    const copyContext = readFileSync(
      join(directories.at(-1)!, "copied", "conversation.jsonl"),
      "utf8",
    );
    const originalContext = readFileSync(
      join(directories.at(-1)!, "original", "conversation.jsonl"),
      "utf8",
    );
    expect(copyContext).toBe(originalContext);
    expect((await runs.getCopyCheckpoint("copied"))?.runIds).toEqual(
      copied.runIds,
    );
    await runs.dispose();
    const restarted = createRunsPlugin({ runsDir: directories.at(-1)! });
    expect(
      await restarted.copyRun({
        runId: "original",
        targetRunId: "copied",
        cwd: "/destination",
      }),
    ).toEqual(copied);
    await restarted.prepareRun({ runId: "copied" });
    expect(
      await restarted.startRun("copied", "continue").completion,
    ).toMatchObject({ status: "completed" });
    expect((await restarted.getHistory("original")).entries).toEqual(
      (await runs.getHistory("original")).entries,
    );
    await restarted.dispose();
  });

  it("should copy the previous completed response while the original waits for input", async () => {
    const runs = fixture();
    await runs.prepareRun({
      runId: "chat",
      configuration: { strategyPath: "example.json" },
    });
    await runs.startRun("chat", "first response").completion;
    const checkpoint = await runs.getCopyCheckpoint("chat");
    const completedHistory = await runs.getHistory("chat");
    await runs.prepareRun({ runId: "chat" });
    const waiting = Promise.withResolvers<void>();
    await runs.notifications.subscribe("run_input_requested", "chat", () =>
      waiting.resolve(),
    );
    const execution = runs.startRun("chat", "needs-input");
    await waiting.promise;
    expect(runs.getPendingInputs("chat").length).toBeGreaterThan(0);
    const copied = await runs.copyRun({ runId: "chat", cwd: "/other" });
    expect((await runs.getHistory(copied.runId)).entries).toEqual(
      completedHistory.entries.map((entry) => ({
        ...entry,
        runId: copied.runId,
      })),
    );
    expect((await runs.getRun("chat"))?.phase).toBe("running");
    expect((await runs.getCopyCheckpoint("chat"))?.checkpointId).toBe(
      checkpoint?.checkpointId,
    );
    await runs.stopRun("chat");
    await execution.completion;
    expect(runs.getPendingInputs("chat")).toEqual([]);
    expect((await runs.getCopyCheckpoint("chat"))?.checkpointId).toBe(
      checkpoint?.checkpointId,
    );
    await runs.dispose();
  });

  it("should expose checkpoint availability and ISO dates through the wire command", async () => {
    const runs = fixture();
    await runs.prepareRun({
      runId: "chat",
      configuration: { strategyPath: "example.json" },
    });
    const server = createDaemonServer({
      daemon: { plugins: { runs } },
      port: 0,
    });
    await server.start();
    const client = await connectSocket(server.url);
    try {
      client.send({
        type: "command",
        requestId: crypto.randomUUID(),
        command: "runs.getCopyCheckpoint",
        arguments: { runId: "chat" },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        ok: true,
        data: { checkpoint: null },
      });
      await runs.startRun("chat", "first complete response").completion;
      const checkpoint = await runs.getCopyCheckpoint("chat");
      client.send({
        type: "command",
        requestId: crypto.randomUUID(),
        command: "runs.getCopyCheckpoint",
        arguments: { runId: "chat" },
      });
      expect(await client.next()).toMatchObject({
        type: "response",
        ok: true,
        data: {
          checkpoint: {
            checkpointId: checkpoint!.checkpointId,
            completedAt: checkpoint!.completedAt.toISOString(),
            runIds: ["chat"],
          },
        },
      });
    } finally {
      client.socket.close();
      await server.stop();
      await runs.dispose();
    }
  });

  it("should refuse copies before a first completed response and refuse deleting originals", async () => {
    const runs = fixture();
    await runs.prepareRun({
      runId: "chat",
      configuration: { strategyPath: "example.json" },
    });
    expect(await runs.getCopyCheckpoint("chat")).toBeUndefined();
    await expect(
      runs.copyRun({ runId: "chat", cwd: "/other" }),
    ).rejects.toThrow("no completed response");
    await expect(runs.removeCopiedRuns(["chat"])).rejects.toThrow(
      "without copy ownership",
    );
    expect(await runs.getRun("chat")).toBeDefined();
    await runs.dispose();
  });

  it("should recover an interrupted publication and safely roll back only the copied tree", async () => {
    const runs = fixture();
    await runs.prepareRun({
      runId: "original",
      configuration: { strategyPath: "example.json" },
    });
    await runs.startRun("original", "child").completion;
    const copied = await runs.copyRun({
      runId: "original",
      targetRunId: "copy",
      cwd: "/destination",
    });
    const runsDir = directories.at(-1)!;
    const manifestPath = join(runsDir, ".copies", "copy", "copy.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, committed: false }),
    );
    const stage = join(runsDir, ".copy-staging", "copy");
    mkdirSync(stage, { recursive: true });
    renameSync(join(runsDir, "copy"), join(stage, "copy"));
    const restarted = createRunsPlugin({ runsDir });
    expect(
      await restarted.copyRun({
        runId: "original",
        targetRunId: "copy",
        cwd: "/destination",
      }),
    ).toEqual(copied);
    await restarted.removeCopiedRuns(["copy"]);
    await restarted.removeCopiedRuns(["copy"]);
    expect(
      copied.runIds.every((runId) => !existsSync(join(runsDir, runId))),
    ).toBe(true);
    expect(await restarted.getRun("original")).toBeDefined();
    expect(
      (await restarted.getCopyCheckpoint("original"))?.runIds,
    ).toHaveLength(2);
    await runs.dispose();
    await restarted.dispose();
  });
});
