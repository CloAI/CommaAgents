import { describe, expect, it } from "bun:test";
import type { TimelineEvent } from "../timeline.types";
import { projectFileState } from "./file-state";

const makeMutation = (
  operation: "create" | "update" | "delete" | "move",
  path: string,
  extra: any = {},
): TimelineEvent => {
  return {
    type: "tool_mutation",
    ts: new Date().toISOString(),
    agentName: "writer",
    toolName: "edit_file",
    operation,
    path,
    success: true,
    ...extra,
  };
};

describe("projectFileState", () => {
  it("should track creates and updates", () => {
    const events = [
      makeMutation("create", "src/foo.ts", { afterSha256: "h1" }),
      makeMutation("update", "src/foo.ts", {
        beforeSha256: "h1",
        afterSha256: "h2",
      }),
    ];

    const state = projectFileState(events);
    const entry = state.get("src/foo.ts");
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe("h2");
    expect(entry?.deleted).toBe(false);
  });

  it("should handle deletes", () => {
    const events = [
      makeMutation("create", "src/foo.ts", { afterSha256: "h1" }),
      makeMutation("delete", "src/foo.ts", { beforeSha256: "h1" }),
    ];

    const state = projectFileState(events);
    const entry = state.get("src/foo.ts");
    expect(entry?.deleted).toBe(true);
    expect(entry?.sha256).toBe("h1");
  });

  it("should handle renames / moves", () => {
    const events = [
      makeMutation("create", "src/foo.ts", { afterSha256: "h1" }),
      makeMutation("move", "src/foo.ts", {
        toPath: "src/bar.ts",
        beforeSha256: "h1",
        afterSha256: "h1",
      }),
    ];

    const state = projectFileState(events);
    expect(state.has("src/foo.ts")).toBe(false);
    const entry = state.get("src/bar.ts");
    expect(entry).toBeDefined();
    expect(entry?.sha256).toBe("h1");
  });

  it("should ignore failed mutations", () => {
    const events = [
      makeMutation("create", "src/foo.ts", { afterSha256: "h1" }),
      {
        ...makeMutation("update", "src/foo.ts", {
          beforeSha256: "h1",
          afterSha256: "h2",
        }),
        success: false,
      },
    ];

    const state = projectFileState(events);
    const entry = state.get("src/foo.ts");
    expect(entry?.sha256).toBe("h1");
  });
});
