import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectsPlugin } from "./projects";
import type { CreateProjectsPluginOptions } from "./projects.types";
import { RunPhase, RunOutcomeStatus, RunMessageStatus } from "../runs";
import type { RunSnapshot } from "../runs";
import type { RunHistoryPage } from "../runs/history";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "projects-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const catalogFile = join(directory, "catalog.json");
  const snapshots = new Map<string, RunSnapshot>();
  const histories = new Map<string, RunHistoryPage>();
  const events = new Map<string, Array<(event: unknown) => void>>();
  const notifications = {
    subscribe: vi.fn(
      async (
        type: string,
        runId: string,
        listener: (event: unknown) => void,
      ) => {
        const eventKey = `${type}:${runId}`;
        const receivers = events.get(eventKey) ?? [];
        receivers.push(listener);
        events.set(eventKey, receivers);
        return () => receivers.splice(receivers.indexOf(listener), 1);
      },
    ),
  };
  const copyRun = vi.fn(
    async ({
      runId,
      targetRunId,
      cwd,
    }: {
      runId: string;
      targetRunId: string;
      cwd: string;
    }) => {
      const original = snapshots.get(runId)!;
      snapshots.set(targetRunId, {
        ...original,
        runId: targetRunId,
        configuration: { ...original.configuration, cwd },
      });
      return { runId: targetRunId, runIds: [targetRunId] };
    },
  );
  const removeCopiedRuns = vi.fn(async (rootIds: readonly string[]) => {
    rootIds.forEach((runId) => snapshots.delete(runId));
  });
  const inputs: unknown[] = [];
  const questions: unknown[] = [];
  const permissions: unknown[] = [];
  const options = {
    catalogFile,
    defaultCwd: directory,
    dependencies: {
      runs: {
        getRun: async (runId: string) => snapshots.get(runId),
        getHistory: async (runId: string) =>
          histories.get(runId) ?? { entries: [] },
        listActiveRuns: () =>
          [...snapshots.values()]
            .filter((entry) => entry.phase === "running")
            .map(({ runId, parentRunId }) => ({ runId, parentRunId })),
        getPendingInputs: () => inputs,
        getRunLineage: (runId: string) => [{ runId }],
        copyRun,
        removeCopiedRuns,
        notifications,
      },
      questions: { getPendingQuestions: () => questions, notifications },
      sandbox: { getPendingPermissions: () => permissions, notifications },
    },
  } as unknown as CreateProjectsPluginOptions;
  const plugin = await createProjectsPlugin(options);
  cleanups.push(() => plugin.dispose());
  const addRun = (runId: string, parentRunId?: string) => {
    snapshots.set(runId, {
      runId,
      parentRunId,
      configuration: { cwd: directory, strategyPath: "strategy.json" },
      strategy: null,
      phase: RunPhase.terminal,
      outcome: { status: RunOutcomeStatus.stopped },
    });
  };
  return {
    directory,
    catalogFile,
    plugin,
    options,
    snapshots,
    histories,
    copyRun,
    removeCopiedRuns,
    addRun,
    questions,
    inputs,
    permissions,
    events,
  };
}

describe("project catalog", () => {
  it("should move all unarchived General chats and leave General archives behind", async () => {
    const { plugin, directory, addRun } = await fixture();
    addRun("open");
    addRun("old");
    await plugin.assign({
      projectId: "general",
      runId: "open",
      title: "Current feature",
    });
    await plugin.assign({ projectId: "general", runId: "old" });
    await plugin.archive({ runId: "old", done: true });
    const created = await plugin.create({
      requestId: "create",
      name: "Project",
      cwd: directory,
      sourceProjectId: "general",
      mode: "move",
    });
    expect(created.runIdMap).toEqual({ open: "open" });
    const catalog = await plugin.list();
    expect(catalog.chats.find((chat) => chat.runId === "open")?.projectId).toBe(
      created.project.projectId,
    );
    expect(catalog.chats.find((chat) => chat.runId === "old")).toMatchObject({
      projectId: "general",
      doneAt: expect.any(Date),
      archivedAt: expect.any(Date),
    });
    expect(created.project.createdAt).toBeInstanceOf(Date);
  });

  it("should replay creation after restart without duplicating copied conversations", async () => {
    const { plugin, directory, options, addRun, copyRun } = await fixture();
    addRun("source");
    const source = await plugin.create({
      requestId: "source-project",
      name: "Source",
      cwd: directory,
      mode: "fresh",
    });
    await plugin.assign({
      projectId: source.project.projectId,
      runId: "source",
    });
    const argumentsValue = {
      requestId: "copy",
      name: "Copy",
      cwd: directory,
      sourceProjectId: source.project.projectId,
      mode: "copy" as const,
      runIds: ["source"],
    };
    const first = await plugin.create(argumentsValue);
    await plugin.dispose();
    const restarted = await createProjectsPlugin(options);
    cleanups.push(() => restarted.dispose());
    expect(await restarted.create(argumentsValue)).toEqual(first);
    expect(copyRun).toHaveBeenCalledTimes(1);
    expect((await restarted.list()).chats).toHaveLength(2);
    await expect(
      restarted.create({ ...argumentsValue, name: "Different" }),
    ).rejects.toThrow("different options");
  });

  it("should rollback staged copies when any selected conversation fails", async () => {
    const { plugin, directory, addRun, copyRun, removeCopiedRuns } =
      await fixture();
    const source = await plugin.create({
      requestId: "source",
      name: "Source",
      cwd: directory,
      mode: "fresh",
    });
    for (const runId of ["one", "two"]) {
      addRun(runId);
      await plugin.assign({ projectId: source.project.projectId, runId });
    }
    copyRun
      .mockImplementationOnce(copyRun.getMockImplementation()!)
      .mockRejectedValueOnce(new Error("Copy checkpoint unavailable"));
    await expect(
      plugin.create({
        requestId: "failure",
        name: "Failed",
        cwd: directory,
        sourceProjectId: source.project.projectId,
        mode: "copy",
        runIds: ["one", "two"],
      }),
    ).rejects.toThrow("checkpoint unavailable");
    expect(removeCopiedRuns).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.any(String),
    ]);
    expect((await plugin.list()).projects.map((entry) => entry.name)).toEqual([
      "General",
      "Source",
    ]);
  });

  it("should recover uncommitted copy journals before exposing the catalog", async () => {
    const { plugin, catalogFile, options, removeCopiedRuns } = await fixture();
    await plugin.dispose();
    const saved = JSON.parse(readFileSync(catalogFile, "utf8"));
    saved.requests.push({
      requestId: "crashed",
      fingerprint: "pending",
      targetRootIds: ["orphan-copy"],
    });
    writeFileSync(catalogFile, JSON.stringify(saved));
    const restarted = await createProjectsPlugin(options);
    cleanups.push(() => restarted.dispose());
    expect(removeCopiedRuns).toHaveBeenCalledWith(["orphan-copy"]);
    expect(JSON.parse(readFileSync(catalogFile, "utf8")).requests).toEqual([]);
  });

  it("should search archive titles and visible text without matching hidden reasoning", async () => {
    const { plugin, addRun, histories } = await fixture();
    for (const runId of ["one", "two", "three"]) {
      addRun(runId);
      await plugin.assign({
        projectId: "general",
        runId,
        title: runId === "one" ? "Feature zebra" : runId,
      });
      await plugin.archive({ runId });
    }
    histories.set("two", {
      page: { hasMore: false },
      entries: [
        {
          type: "message",
          messageId: "two-message",
          runId: "two",
          role: "agent",
          agentName: "agent",
          status: RunMessageStatus.completed,
          createdAt: new Date().toISOString(),
          content: [{ type: "text", text: "zebra result" }],
        },
      ],
    });
    histories.set("three", {
      page: { hasMore: false },
      entries: [
        {
          type: "message",
          messageId: "three-message",
          runId: "three",
          role: "agent",
          agentName: "agent",
          status: RunMessageStatus.completed,
          createdAt: new Date().toISOString(),
          content: [{ type: "reasoning", text: "zebra secret" }],
        },
      ],
    });
    const first = await plugin.search({
      projectId: "general",
      query: "zebra",
      limit: 1,
    });
    expect(first.total).toBe(2);
    expect(first.nextOffset).toBe(1);
    expect(
      (
        await plugin.search({
          projectId: "general",
          query: "zebra",
          offset: 1,
          limit: 1,
        })
      ).chats,
    ).toHaveLength(1);
    await plugin.restore("one");
    expect(
      (await plugin.search({ projectId: "general", query: "zebra" })).total,
    ).toBe(1);
  });

  it("should refuse descendant membership and archiving pending decisions", async () => {
    const { plugin, addRun, questions } = await fixture();
    addRun("root");
    addRun("child", "root");
    await expect(
      plugin.assign({ projectId: "general", runId: "child" }),
    ).rejects.toThrow("root conversation");
    await plugin.assign({ projectId: "general", runId: "root" });
    questions.push({ runId: "child" });
    await expect(plugin.archive({ runId: "root" })).rejects.toThrow(
      "pending decisions",
    );
  });

  it("should publish current descendant attention and clear it after permission resolution", async () => {
    const { plugin, addRun, permissions, events } = await fixture();
    addRun("root");
    await plugin.assign({ projectId: "general", runId: "root" });
    const received: boolean[] = [];
    const unsubscribe = await plugin.watch((catalog) =>
      received.push(catalog.chats[0]!.attention.permission),
    );
    expect(received[0]).toBe(false);
    permissions.push({ runId: "child", requestId: "approval" });
    for (const listener of events.get("run_permission_requested:root") ?? []) {
      listener({
        type: "run_permission_requested",
        runId: "child",
        requestId: "approval",
      });
    }
    await vi.waitFor(() => expect(received.at(-1)).toBe(true));
    permissions.length = 0;
    for (const listener of events.get("run_permission_resolved:root") ?? []) {
      listener({
        type: "run_permission_resolved",
        runId: "child",
        requestId: "approval",
      });
    }
    await vi.waitFor(() => expect(received.at(-1)).toBe(false));
    unsubscribe();
    expect((await plugin.list()).chats[0]!.attention.permission).toBe(false);
  });

  it("should validate directories and expose ISO timestamps only on the wire", async () => {
    const { plugin, directory } = await fixture();
    await expect(
      plugin.create({
        requestId: "invalid",
        name: "Invalid",
        cwd: "relative",
        mode: "fresh",
      }),
    ).rejects.toThrow("absolute path");
    const command = plugin.server!.commands!.find(
      (entry) => entry.name === "projects.create",
    )!;
    const result = await command.invoke({
      requestId: "wire",
      name: "Wire",
      cwd: directory,
      mode: "fresh",
    });
    expect(result).toMatchObject({
      project: { createdAt: expect.stringMatching(/^\d{4}-/) },
    });
  });
});

it("should reserve question attention for the question tool and retain input archive protection", async () => {
  const { plugin, addRun, inputs, questions } = await fixture();
  addRun("chat");
  await plugin.assign({ projectId: "general", runId: "chat" });
  inputs.push({ inputId: "generic-input" });
  expect((await plugin.list()).chats[0]?.attention.question).toBe(false);
  await expect(plugin.archive({ runId: "chat" })).rejects.toThrow(
    "pending decisions",
  );
  questions.push({ questionId: "tool-question" });
  expect((await plugin.list()).chats[0]?.attention.question).toBe(true);
});

it("should expose the latest finalized entry identity for client read tracking", async () => {
  const { plugin, addRun, histories } = await fixture();
  addRun("chat");
  await plugin.assign({ projectId: "general", runId: "chat" });
  expect((await plugin.list()).chats[0]?.latestEntryId).toBeUndefined();
  histories.set("chat", {
    page: { hasMore: false },
    entries: [
      {
        type: "message",
        messageId: "response-1",
        runId: "chat",
        role: "user",
        status: RunMessageStatus.completed,
        createdAt: new Date().toISOString(),
        content: [{ type: "text", text: "Hello" }],
      },
    ],
  });
  expect((await plugin.list()).chats[0]?.latestEntryId).toBe("response-1");
});
