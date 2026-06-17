import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTimeline,
  type Timeline,
  type ToolContext,
  type ToolHooks,
} from "@comma-agents/core";
import { createMutationCapture } from "./mutation-capture";

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "rlprompter-mut-"));
  dirs.push(dir);
  return dir;
}

/** Drive a before/after hook pair around an on-disk change. */
async function drive(
  hooks: ToolHooks,
  name: string,
  args: Record<string, unknown>,
  change: () => Promise<void>,
): Promise<void> {
  const payloadBase = {
    name,
    args: JSON.stringify(args),
    toolContext: {} as ToolContext,
  };
  for (const hook of hooks.beforeToolCall ?? []) await hook(payloadBase);
  await change();
  for (const hook of hooks.afterToolCall ?? [])
    await hook({ ...payloadBase, result: "ok" });
}

function lastMutation(timeline: Timeline) {
  return timeline.events({ type: "tool_mutation" }).at(-1);
}

describe("createMutationCapture", () => {
  it("records a create when a new file appears", async () => {
    const cwd = await makeDir();
    const timeline = createTimeline();
    const hooks = createMutationCapture({ cwd, agentName: "a", timeline });

    await drive(hooks, "write_file", { path: "new.txt" }, async () => {
      await writeFile(join(cwd, "new.txt"), "hello", "utf-8");
    });

    const event = lastMutation(timeline);
    expect(event?.type).toBe("tool_mutation");
    if (event?.type !== "tool_mutation") throw new Error("type");
    expect(event.operation).toBe("create");
    expect(event.path).toBe("new.txt");
    expect(event.success).toBe(true);
    expect(event.afterSha256).toBeDefined();
    expect(event.diff).toContain("hello");
  });

  it("records an update with before/after hashes and a diff", async () => {
    const cwd = await makeDir();
    await writeFile(join(cwd, "f.txt"), "v1", "utf-8");
    const timeline = createTimeline();
    const hooks = createMutationCapture({ cwd, agentName: "a", timeline });

    await drive(hooks, "edit_file", { path: "f.txt" }, async () => {
      await writeFile(join(cwd, "f.txt"), "v2", "utf-8");
    });

    const event = lastMutation(timeline);
    if (event?.type !== "tool_mutation") throw new Error("type");
    expect(event.operation).toBe("update");
    expect(event.beforeSha256).toBeDefined();
    expect(event.afterSha256).toBeDefined();
    expect(event.beforeSha256).not.toBe(event.afterSha256);
  });

  it("records a delete when the file disappears", async () => {
    const cwd = await makeDir();
    await writeFile(join(cwd, "gone.txt"), "bye", "utf-8");
    const timeline = createTimeline();
    const hooks = createMutationCapture({ cwd, agentName: "a", timeline });

    await drive(hooks, "delete_file", { path: "gone.txt" }, async () => {
      await unlink(join(cwd, "gone.txt"));
    });

    const event = lastMutation(timeline);
    if (event?.type !== "tool_mutation") throw new Error("type");
    expect(event.operation).toBe("delete");
    expect(event.success).toBe(true);
    expect(event.beforeSha256).toBeDefined();
  });

  it("records a move with from/to paths", async () => {
    const cwd = await makeDir();
    await writeFile(join(cwd, "from.txt"), "data", "utf-8");
    const timeline = createTimeline();
    const hooks = createMutationCapture({ cwd, agentName: "a", timeline });

    await drive(
      hooks,
      "move_file",
      { fromPath: "from.txt", toPath: "to.txt" },
      async () => {
        await writeFile(join(cwd, "to.txt"), "data", "utf-8");
        await unlink(join(cwd, "from.txt"));
      },
    );

    const event = lastMutation(timeline);
    if (event?.type !== "tool_mutation") throw new Error("type");
    expect(event.operation).toBe("move");
    expect(event.path).toBe("from.txt");
    expect(event.toPath).toBe("to.txt");
    expect(event.success).toBe(true);
  });

  it("ignores non-mutating tools", async () => {
    const cwd = await makeDir();
    const timeline = createTimeline();
    const hooks = createMutationCapture({ cwd, agentName: "a", timeline });

    await drive(hooks, "read_file", { path: "f.txt" }, async () => {});

    expect(timeline.events({ type: "tool_mutation" })).toHaveLength(0);
  });
});
