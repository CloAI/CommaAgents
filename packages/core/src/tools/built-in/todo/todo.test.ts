import { beforeEach, describe, expect, it } from "bun:test";
import { makeToolContext } from "../../test.utils";
import {
  createTodoAddTool,
  createTodoClearTool,
  createTodoCompleteTool,
  createTodoGetNextTool,
  createTodoGetTool,
  resetAllTodoState,
} from "./index";

const primaryContext = makeToolContext({ agentName: "todo-test-agent" });
const secondaryContext = makeToolContext({ agentName: "other-agent" });

beforeEach(() => {
  resetAllTodoState();
});

describe("todo tools", () => {
  it("todo_add appends an item and returns its id", async () => {
    const add = createTodoAddTool();
    const result = await add.execute({ content: "first task" }, primaryContext);
    expect(result.output).toContain("Added todo #1");
    expect(result.metadata?.id).toBe("1");
    expect(result.metadata?.totalItems).toBe(1);
  });

  it("todo_get returns all items with status markers", async () => {
    const add = createTodoAddTool();
    const get = createTodoGetTool();
    await add.execute({ content: "alpha" }, primaryContext);
    await add.execute({ content: "beta" }, primaryContext);
    const result = await get.execute({}, primaryContext);
    expect(result.output).toContain("[ ] #1: alpha");
    expect(result.output).toContain("[ ] #2: beta");
    expect(result.metadata?.totalItems).toBe(2);
    expect(result.metadata?.pending).toBe(2);
  });

  it("todo_get returns empty marker when no items exist", async () => {
    const get = createTodoGetTool();
    const result = await get.execute({}, primaryContext);
    expect(result.output).toContain("[No todo items]");
    expect(result.metadata?.totalItems).toBe(0);
  });

  it("todo_complete marks done and returns the next pending item", async () => {
    const add = createTodoAddTool();
    const complete = createTodoCompleteTool();
    await add.execute({ content: "first" }, primaryContext);
    await add.execute({ content: "second" }, primaryContext);
    const result = await complete.execute({ id: "1" }, primaryContext);
    expect(result.output).toContain("Completed #1");
    expect(result.output).toContain("second");
    expect(result.metadata?.nextId).toBe("2");
    expect(result.metadata?.remaining).toBe(1);
  });

  it("todo_complete reports all done when nothing is pending", async () => {
    const add = createTodoAddTool();
    const complete = createTodoCompleteTool();
    await add.execute({ content: "only one" }, primaryContext);
    const result = await complete.execute({ id: "1" }, primaryContext);
    expect(result.output).toContain("All todos are done");
    expect(result.metadata?.nextId).toBeNull();
  });

  it("todo_complete handles unknown ids gracefully", async () => {
    const complete = createTodoCompleteTool();
    const result = await complete.execute({ id: "999" }, primaryContext);
    expect(result.output).toContain("No todo item");
    expect(result.metadata?.found).toBe(false);
  });

  it("todo_get_next returns the first pending item", async () => {
    const add = createTodoAddTool();
    const complete = createTodoCompleteTool();
    const getNext = createTodoGetNextTool();
    await add.execute({ content: "one" }, primaryContext);
    await add.execute({ content: "two" }, primaryContext);
    await complete.execute({ id: "1" }, primaryContext);
    const result = await getNext.execute({}, primaryContext);
    expect(result.output).toContain("[ ] #2: two");
    expect(result.metadata?.hasNext).toBe(true);
  });

  it("todo_get_next reports when nothing is pending", async () => {
    const getNext = createTodoGetNextTool();
    const result = await getNext.execute({}, primaryContext);
    expect(result.output).toContain("[No pending todo items]");
    expect(result.metadata?.hasNext).toBe(false);
  });

  it("todo_clear removes all items for the agent", async () => {
    const add = createTodoAddTool();
    const clear = createTodoClearTool();
    const get = createTodoGetTool();
    await add.execute({ content: "x" }, primaryContext);
    await add.execute({ content: "y" }, primaryContext);
    const cleared = await clear.execute({}, primaryContext);
    expect(cleared.metadata?.cleared).toBe(2);
    const result = await get.execute({}, primaryContext);
    expect(result.output).toContain("[No todo items]");
  });

  it("state is isolated between agents", async () => {
    const add = createTodoAddTool();
    const get = createTodoGetTool();
    await add.execute({ content: "agent A item" }, primaryContext);
    await add.execute({ content: "agent B item" }, secondaryContext);

    const aResult = await get.execute({}, primaryContext);
    const bResult = await get.execute({}, secondaryContext);

    expect(aResult.output).toContain("agent A item");
    expect(aResult.output).not.toContain("agent B item");
    expect(bResult.output).toContain("agent B item");
    expect(bResult.output).not.toContain("agent A item");
  });

  it("state persists across multiple tool calls within the same agent", async () => {
    const add = createTodoAddTool();
    const get = createTodoGetTool();
    await add.execute({ content: "persist 1" }, primaryContext);
    await add.execute({ content: "persist 2" }, primaryContext);
    const result = await get.execute({}, primaryContext);
    expect(result.metadata?.totalItems).toBe(2);
  });
});
