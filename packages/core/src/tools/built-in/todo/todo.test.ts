// Tests for the todo built-in tools

import { beforeEach, describe, expect, it } from "bun:test";
import { makeToolContext } from "../../test.utils";
import {
  createTodoAddTool,
  createTodoClearTool,
  createTodoCompleteTool,
  createTodoGetNextTool,
  createTodoGetTool,
  resetAllTodoState,
} from "./todo";

const ctx = makeToolContext({ agentName: "todo-test-agent" });
const otherCtx = makeToolContext({ agentName: "other-agent" });

beforeEach(() => {
  resetAllTodoState();
});

describe("todo tools", () => {
  it("todo_add appends an item and returns its id", async () => {
    const add = createTodoAddTool();
    const result = await add.execute({ content: "first task" }, ctx);
    expect(result.output).toContain("Added todo #1");
    expect(result.metadata?.id).toBe("1");
    expect(result.metadata?.totalItems).toBe(1);
  });

  it("todo_get returns all items with status markers", async () => {
    const add = createTodoAddTool();
    const get = createTodoGetTool();
    await add.execute({ content: "alpha" }, ctx);
    await add.execute({ content: "beta" }, ctx);
    const result = await get.execute({}, ctx);
    expect(result.output).toContain("[ ] #1: alpha");
    expect(result.output).toContain("[ ] #2: beta");
    expect(result.metadata?.totalItems).toBe(2);
    expect(result.metadata?.pending).toBe(2);
  });

  it("todo_get returns empty marker when no items exist", async () => {
    const get = createTodoGetTool();
    const result = await get.execute({}, ctx);
    expect(result.output).toContain("[No todo items]");
    expect(result.metadata?.totalItems).toBe(0);
  });

  it("todo_complete marks done and returns the next pending item", async () => {
    const add = createTodoAddTool();
    const complete = createTodoCompleteTool();
    await add.execute({ content: "first" }, ctx);
    await add.execute({ content: "second" }, ctx);
    const result = await complete.execute({ id: "1" }, ctx);
    expect(result.output).toContain("Completed #1");
    expect(result.output).toContain("second");
    expect(result.metadata?.nextId).toBe("2");
    expect(result.metadata?.remaining).toBe(1);
  });

  it("todo_complete reports all done when nothing is pending", async () => {
    const add = createTodoAddTool();
    const complete = createTodoCompleteTool();
    await add.execute({ content: "only one" }, ctx);
    const result = await complete.execute({ id: "1" }, ctx);
    expect(result.output).toContain("All todos are done");
    expect(result.metadata?.nextId).toBeNull();
  });

  it("todo_complete handles unknown ids gracefully", async () => {
    const complete = createTodoCompleteTool();
    const result = await complete.execute({ id: "999" }, ctx);
    expect(result.output).toContain("No todo item");
    expect(result.metadata?.found).toBe(false);
  });

  it("todo_get_next returns the first pending item", async () => {
    const add = createTodoAddTool();
    const complete = createTodoCompleteTool();
    const getNext = createTodoGetNextTool();
    await add.execute({ content: "one" }, ctx);
    await add.execute({ content: "two" }, ctx);
    await complete.execute({ id: "1" }, ctx);
    const result = await getNext.execute({}, ctx);
    expect(result.output).toContain("[ ] #2: two");
    expect(result.metadata?.hasNext).toBe(true);
  });

  it("todo_get_next reports when nothing is pending", async () => {
    const getNext = createTodoGetNextTool();
    const result = await getNext.execute({}, ctx);
    expect(result.output).toContain("[No pending todo items]");
    expect(result.metadata?.hasNext).toBe(false);
  });

  it("todo_clear removes all items for the agent", async () => {
    const add = createTodoAddTool();
    const clear = createTodoClearTool();
    const get = createTodoGetTool();
    await add.execute({ content: "x" }, ctx);
    await add.execute({ content: "y" }, ctx);
    const cleared = await clear.execute({}, ctx);
    expect(cleared.metadata?.cleared).toBe(2);
    const result = await get.execute({}, ctx);
    expect(result.output).toContain("[No todo items]");
  });

  it("state is isolated between agents", async () => {
    const add = createTodoAddTool();
    const get = createTodoGetTool();
    await add.execute({ content: "agent A item" }, ctx);
    await add.execute({ content: "agent B item" }, otherCtx);

    const aResult = await get.execute({}, ctx);
    const bResult = await get.execute({}, otherCtx);

    expect(aResult.output).toContain("agent A item");
    expect(aResult.output).not.toContain("agent B item");
    expect(bResult.output).toContain("agent B item");
    expect(bResult.output).not.toContain("agent A item");
  });

  it("state persists across multiple tool calls within the same agent", async () => {
    const add = createTodoAddTool();
    const get = createTodoGetTool();
    await add.execute({ content: "persist 1" }, ctx);
    await add.execute({ content: "persist 2" }, ctx);
    const result = await get.execute({}, ctx);
    expect(result.metadata?.totalItems).toBe(2);
  });
});
