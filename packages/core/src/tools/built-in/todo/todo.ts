import { z } from "zod";

import { defineTool } from "../../define/define-tool";
import { okResult } from "../../result";
import type { ToolDefinition } from "../../tool.types";
import type { TodoItem } from "./todo.types";

const todoStore = new Map<string, TodoItem[]>();
const idCounters = new Map<string, number>();

function getList(agentName: string): TodoItem[] {
  let list = todoStore.get(agentName);
  if (!list) {
    list = [];
    todoStore.set(agentName, list);
  }
  return list;
}

function nextId(agentName: string): string {
  const current = idCounters.get(agentName) ?? 0;
  const next = current + 1;
  idCounters.set(agentName, next);
  return String(next);
}

function formatItem(item: TodoItem): string {
  const marker = item.status === "completed" ? "[x]" : "[ ]";
  return `${marker} #${item.id}: ${item.content}`;
}

/**
 * Reset the todo state for a single agent. Exposed for tests and embedders.
 */
export function resetTodoStateForAgent(agentName: string): void {
  todoStore.delete(agentName);
  idCounters.delete(agentName);
}

/**
 * Reset all todo state across all agents. Exposed for tests.
 */
export function resetAllTodoState(): void {
  todoStore.clear();
  idCounters.clear();
}

const todoAddParams = z.object({
  content: z.string().min(1).describe("Description of the todo item to add."),
});

/**
 * Create the `todo_add` tool, which appends a new pending item to the agent's
 * todo list and returns its assigned id.
 */
export function createTodoAddTool(): ToolDefinition<typeof todoAddParams> {
  return defineTool({
    description:
      "Add a new item to the todo list. Returns the new item's id. " +
      "Use this to track sub-tasks while working on a larger task.",
    parameters: todoAddParams,
    execute: async (validatedArguments, toolContext) => {
      const list = getList(toolContext.agentName);
      const item: TodoItem = {
        id: nextId(toolContext.agentName),
        content: validatedArguments.content,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      list.push(item);
      return okResult(`Added todo #${item.id}: ${item.content}`, {
        metadata: { id: item.id, totalItems: list.length },
      });
    },
  });
}

const todoCompleteParams = z.object({
  id: z
    .string()
    .min(1)
    .describe("The id of the todo item to mark as completed."),
});

/**
 * Create the `todo_complete` tool, which marks an item complete and returns
 * the next pending item (or a "all done" message).
 */
export function createTodoCompleteTool(): ToolDefinition<
  typeof todoCompleteParams
> {
  return defineTool({
    description:
      "Mark a todo item as completed by id. Returns the next pending todo item, " +
      "or a confirmation that all items are done. Use this to advance through " +
      "your task list one item at a time.",
    parameters: todoCompleteParams,
    execute: async (validatedArguments, toolContext) => {
      const list = getList(toolContext.agentName);
      const target = list.find((entry) => entry.id === validatedArguments.id);
      if (!target) {
        return okResult(
          `No todo item with id #${validatedArguments.id} was found.`,
          {
            metadata: { found: false },
          },
        );
      }
      if (target.status !== "completed") {
        target.status = "completed";
        target.completedAt = new Date().toISOString();
      }
      const next = list.find((entry) => entry.status === "pending");
      const remaining = list.filter(
        (entry) => entry.status === "pending",
      ).length;
      const output = next
        ? `Completed #${target.id}. Next: ${formatItem(next)} (${remaining} remaining)`
        : `Completed #${target.id}. All todos are done.`;
      return okResult(output, {
        metadata: {
          completedId: target.id,
          nextId: next?.id ?? null,
          remaining,
        },
      });
    },
  });
}

const todoGetParams = z.object({});

/**
 * Create the `todo_get` tool, which returns the full todo list for the agent.
 */
export function createTodoGetTool(): ToolDefinition<typeof todoGetParams> {
  return defineTool({
    description:
      "Get all todo items for the current agent, including completed and pending ones. " +
      "Use this to review progress or remember outstanding tasks.",
    parameters: todoGetParams,
    execute: async (_validatedArguments, toolContext) => {
      const list = getList(toolContext.agentName);
      if (list.length === 0) {
        return okResult("[No todo items]", { metadata: { totalItems: 0 } });
      }
      const lines = list.map(formatItem);
      const pending = list.filter((entry) => entry.status === "pending").length;
      return okResult(
        `${lines.join("\n")}\n\n[${pending} pending / ${list.length} total]`,
        {
          metadata: { totalItems: list.length, pending },
        },
      );
    },
  });
}

const todoGetNextParams = z.object({});

/**
 * Create the `todo_get_next` tool, which returns the next pending todo item.
 */
export function createTodoGetNextTool(): ToolDefinition<
  typeof todoGetNextParams
> {
  return defineTool({
    description:
      "Get the next pending todo item without modifying the list. " +
      "Returns a message indicating no pending items if the list is exhausted.",
    parameters: todoGetNextParams,
    execute: async (_validatedArguments, toolContext) => {
      const list = getList(toolContext.agentName);
      const next = list.find((entry) => entry.status === "pending");
      if (!next) {
        return okResult("[No pending todo items]", {
          metadata: { hasNext: false },
        });
      }
      return okResult(formatItem(next), {
        metadata: { hasNext: true, id: next.id },
      });
    },
  });
}

const todoClearParams = z.object({});

/**
 * Create the `todo_clear` tool, which removes all todo items for the agent.
 */
export function createTodoClearTool(): ToolDefinition<typeof todoClearParams> {
  return defineTool({
    description:
      "Clear all todo items for the current agent. Use this when starting a new task " +
      "or when the existing list is no longer relevant.",
    parameters: todoClearParams,
    execute: async (_validatedArguments, toolContext) => {
      const previousLength = getList(toolContext.agentName).length;
      resetTodoStateForAgent(toolContext.agentName);
      return okResult(`Cleared ${previousLength} todo item(s).`, {
        metadata: { cleared: previousLength },
      });
    },
  });
}
