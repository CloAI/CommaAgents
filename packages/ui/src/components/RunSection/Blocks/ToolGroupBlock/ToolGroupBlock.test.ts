import type { RunToolStatus } from "@comma-agents/daemon";
import { describe, expect, it } from "vitest";
import type { RunContent } from "../../../../hooks/runs";
import { groupRunContent } from "./ToolGroupBlock.utils";

describe("groupRunContent", () => {
  const first = {
    type: "tool",
    toolCallId: "a",
    toolName: "read",
    arguments: {},
    status: "running" as RunToolStatus.running,
  } satisfies RunContent;
  const second = { ...first, toolCallId: "b" };

  it("groups tools across empty placeholders and retains original objects", () => {
    const result = groupRunContent([
      first,
      { type: "text", text: " " },
      { type: "reasoning", text: "" },
      second,
    ]);
    expect(result).toEqual([
      { type: "tools", key: "tools-a", tools: [first, second] },
    ]);
    if (result[0]?.type === "tools") {
      expect(result[0].tools[0]).toBe(first);
    }
  });

  it("keeps visible prose and reasoning as chronological boundaries", () => {
    const text = { type: "text", text: "Explanation" } as const;
    const reasoning = { type: "reasoning", text: "Thinking" } as const;
    expect(
      groupRunContent([first, text, second, reasoning, first]).map(
        (block) => block.type,
      ),
    ).toEqual(["tools", "content", "tools", "content", "tools"]);
  });

  it("keeps group identity stable when more calls arrive or statuses change", () => {
    expect(groupRunContent([first])[0]?.key).toBe(
      groupRunContent([
        {
          ...first,
          status: "completed" as RunToolStatus.completed,
          output: null,
        },
        second,
      ])[0]?.key,
    );
  });

  it("omits empty content without creating groups", () => {
    expect(groupRunContent([{ type: "text", text: "" }])).toEqual([]);
  });
});
