import { describe, expect, it } from "bun:test";
import { RunSnapshotSchema } from "./state.schemas";
import {
  UserMessageSchema,
  CompletedAgentMessageSchema,
  CompletedToolContentSchema,
  FailedToolContentSchema,
} from "../messages/messages.schemas";
const common = {
  runId: "run",
  configuration: { strategyPath: "example.json", cwd: "/workspace" },
};
const description = {
  name: "example",
  agents: ["writer"],
  flow: { name: "main", type: "sequential", steps: [{ agent: "writer" }] },
};
describe("run schema guarantees", () => {
  it("should require loaded strategy metadata and terminal outcomes only in the corresponding phases", () => {
    expect(
      RunSnapshotSchema.safeParse({
        ...common,
        phase: "preparing",
        strategy: null,
      }).success,
    ).toBe(true);
    expect(
      RunSnapshotSchema.safeParse({
        ...common,
        phase: "prepared",
        strategy: null,
        unmatchedAgents: [],
      }).success,
    ).toBe(false);
    expect(
      RunSnapshotSchema.safeParse({
        ...common,
        phase: "prepared",
        strategy: description,
        unmatchedAgents: [],
      }).success,
    ).toBe(true);
    expect(
      RunSnapshotSchema.safeParse({
        ...common,
        phase: "running",
        strategy: description,
        outcome: { status: "stopped" },
      }).success,
    ).toBe(false);
    expect(
      RunSnapshotSchema.safeParse({
        ...common,
        phase: "terminal",
        strategy: null,
      }).success,
    ).toBe(false);
    expect(
      RunSnapshotSchema.safeParse({
        ...common,
        phase: "terminal",
        strategy: null,
        outcome: { status: "stopped" },
      }).success,
    ).toBe(true);
    expect(
      RunSnapshotSchema.safeParse({
        ...common,
        phase: "running",
        strategy: description,
        conversation: {},
      }).success,
    ).toBe(false);
  });
  it("should reject message and tool states that lack their required data", () => {
    const message = {
      type: "message",
      messageId: "message",
      runId: "run",
      createdAt: "2026-10-20T00:00:00.000Z",
      content: [],
      status: "completed",
    };
    expect(
      UserMessageSchema.safeParse({ ...message, role: "user" }).success,
    ).toBe(true);
    expect(
      UserMessageSchema.safeParse({
        ...message,
        role: "user",
        status: "streaming",
      }).success,
    ).toBe(false);
    expect(
      CompletedAgentMessageSchema.safeParse({ ...message, role: "agent" })
        .success,
    ).toBe(false);
    const tool = {
      type: "tool",
      toolCallId: "call",
      toolName: "read",
      arguments: {},
      status: "completed",
    };
    expect(CompletedToolContentSchema.safeParse(tool).success).toBe(false);
    expect(
      CompletedToolContentSchema.safeParse({ ...tool, output: null }).success,
    ).toBe(true);
    expect(
      FailedToolContentSchema.safeParse({
        ...tool,
        status: "failed",
        output: null,
      }).success,
    ).toBe(false);
  });
});
