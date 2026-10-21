import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPlugin } from "../../../daemon-plugin";
import { createRunsContext } from "../state";
import type { RunEntry } from "../state/state.types";
import type { RunNotifications, RunStatus } from "../runs.notifications";
import {
  completeAgentMessage,
  interruptAgentMessages,
  startAgentMessage,
  streamAgentMessage,
} from "./messages";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("run display messages", () => {
  it("should replace cumulative blocks in order and update a tool result at its original index", async () => {
    const directory = mkdtempSync(join(tmpdir(), "run-messages-"));
    directories.push(directory);
    const { notifications } = createPlugin<"runs", RunNotifications>({
      name: "runs",
      notifications: true,
      cleanup: async () => {},
    });
    const context = createRunsContext({ runsDir: directory }, notifications);
    const entry: RunEntry = {
      snapshot: {
        runId: "run",
        phase: "preparing",
        strategyPath: "example.json",
        cwd: directory,
        mode: "new",
      },
      lifecycle: { phase: "preparing" },
      controller: new AbortController(),
      optionsKey: "",
      disposers: [],
      pendingInput: new Map(),
      steering: [],
      children: new Set(),
    };
    context.runs.set("run", entry);
    const messages: RunStatus[] = [];
    await notifications.subscribe("run_message_stream", "run", (message) => {
      messages.push(message);
    });
    const identity = {
      messageId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await startAgentMessage(context, entry, "writer", identity);
    for (const event of [
      { type: "thinking", id: "reasoning", text: "Think" },
      { type: "thinking", id: "reasoning", text: " more" },
      { type: "text", text: "Look" },
      { type: "text", text: " here" },
      {
        type: "tool-call",
        toolCallId: "tool",
        toolName: "read",
        args: '{"path":"file.ts"}',
      },
      { type: "text", text: "After tool" },
      {
        type: "tool-result",
        toolCallId: "tool",
        toolName: "read",
        status: "completed",
        output: "file contents",
      },
    ] as const) {
      await streamAgentMessage(context, entry, "writer", {
        ...event,
        ...identity,
      });
    }
    expect(messages[1]).toMatchObject({
      contentIndex: 0,
      content: { type: "reasoning", text: "Think more" },
    });
    expect(messages[3]).toMatchObject({
      contentIndex: 1,
      content: { type: "text", text: "Look here" },
    });
    expect(messages[6]).toMatchObject({
      contentIndex: 2,
      content: {
        type: "tool",
        toolCallId: "tool",
        arguments: { path: "file.ts" },
        status: "completed",
        output: "file contents",
      },
    });
    await completeAgentMessage(context, entry, "writer", {
      ...identity,
      text: "final text",
      responseMessages: [],
      steps: [],
      usage: { promptTokens: 1, completionTokens: 2 },
      finishReason: "stop",
    });
    expect((await context.history.read("run")).entries).toMatchObject([
      {
        messageId: identity.messageId,
        status: "completed",
        content: [{ type: "text", text: "final text" }],
      },
    ]);
    expect(context.activeMessages.size).toBe(0);
  });

  it("should finalize only the failed invocation when another agent invocation remains active", async () => {
    const directory = mkdtempSync(join(tmpdir(), "run-messages-"));
    directories.push(directory);
    const { notifications } = createPlugin<"runs", RunNotifications>({
      name: "runs",
      notifications: true,
      cleanup: async () => {},
    });
    const context = createRunsContext({ runsDir: directory }, notifications);
    const entry: RunEntry = {
      snapshot: {
        runId: "run",
        phase: "preparing",
        strategyPath: "example.json",
        cwd: directory,
        mode: "new",
      },
      lifecycle: { phase: "preparing" },
      controller: new AbortController(),
      optionsKey: "",
      disposers: [],
      pendingInput: new Map(),
      steering: [],
      children: new Set(),
    };
    for (const messageId of ["failed", "active"]) {
      await streamAgentMessage(context, entry, "writer", {
        type: "text",
        text: messageId,
        messageId,
      });
    }
    await interruptAgentMessages(context, "run", "failed", "failed");
    expect(context.activeMessages.has("active")).toBe(true);
    expect((await context.history.read("run")).entries).toMatchObject([
      { messageId: "failed", status: "failed", content: [{ text: "failed" }] },
    ]);
    await interruptAgentMessages(context, "run", "cancelled");
  });
});
