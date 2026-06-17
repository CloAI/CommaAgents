import { describe, expect, it } from "bun:test";
import type { ConversationRecord, TimelineEvent } from "@comma-agents/core";
import { compareIterations } from "./compare";

function agentCall(text: string): TimelineEvent {
  return {
    type: "agent_call",
    ts: "2026-01-01T00:00:00.000Z",
    record: {
      id: "r",
      agentName: "assistant",
      createdAt: "2026-01-01T00:00:00.000Z",
      userMessage: { role: "user", content: text },
      responseMessages: [],
      text,
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop",
    } as unknown as ConversationRecord,
  };
}

function mutation(
  path: string,
  sha: string,
  operation: "create" | "update" | "delete" = "create",
): TimelineEvent {
  return {
    type: "tool_mutation",
    ts: "2026-01-01T00:00:01.000Z",
    agentName: "assistant",
    toolName: "write_file",
    operation,
    path,
    afterSha256: operation === "delete" ? undefined : sha,
    beforeSha256: operation === "delete" ? sha : undefined,
    diff: `diff for ${path} ${sha}`,
    success: true,
  };
}

describe("compareIterations", () => {
  it("diffs final text outputs", () => {
    const result = compareIterations(
      { label: "A", events: [agentCall("hello world")] },
      { label: "B", events: [agentCall("hello there")] },
    );
    expect(result.textDiff).toContain("hello world");
    expect(result.textDiff).toContain("hello there");
  });

  it("classifies added, removed, changed, and skips unchanged", () => {
    const a: TimelineEvent[] = [
      mutation("keep.txt", "sha-keep"),
      mutation("only-a.txt", "sha-a"),
      mutation("edited.txt", "sha-v1"),
    ];
    const b: TimelineEvent[] = [
      mutation("keep.txt", "sha-keep"),
      mutation("only-b.txt", "sha-b"),
      mutation("edited.txt", "sha-v2"),
    ];

    const result = compareIterations(
      { label: "A", events: a },
      { label: "B", events: b },
    );
    const byPath = new Map(result.files.map((f) => [f.path, f.status]));

    expect(byPath.get("only-a.txt")).toBe("removed");
    expect(byPath.get("only-b.txt")).toBe("added");
    expect(byPath.get("edited.txt")).toBe("changed");
    expect(byPath.has("keep.txt")).toBe(false); // unchanged → omitted
  });

  it("attaches the relevant diff for changed files", () => {
    const result = compareIterations(
      { label: "A", events: [mutation("f.txt", "v1")] },
      { label: "B", events: [mutation("f.txt", "v2")] },
    );
    const changed = result.files.find((f) => f.path === "f.txt");
    expect(changed?.status).toBe("changed");
    expect(changed?.diff).toContain("v2");
  });

  it("returns sorted files", () => {
    const result = compareIterations(
      { label: "A", events: [] },
      {
        label: "B",
        events: [mutation("z.txt", "z"), mutation("a.txt", "a")],
      },
    );
    expect(result.files.map((f) => f.path)).toEqual(["a.txt", "z.txt"]);
  });
});
