// todo — per-agent todo list tools (add, complete, get, get_next, clear)

import { z } from "zod";
import { defineTool } from "../../define/define-tool";
import type { ToolDefinition } from "../../tool.types";

/**
 * A single todo list entry.
 */
export interface TodoItem {
  readonly id: string;
  readonly content: string;
  status: "pending" | "completed";
  readonly createdAt: string;
  completedAt?: string;
}

/**
 * Module-level state store keyed by agent name. State persists across runs
 * for the same agent within a process lifetime, allowing agents to track
 * progress on multi-step tasks.
 */
const todoStore = new Map<string, TodoItem[]>();
const idCounters = new Map<string, number>();

/**
 * Get (or lazily create) the todo list for the given agent.
 */
function getList(agentName: string): TodoItem[] {
  let list = todoStore.get(agentName);
  if (!list) {
    list = [];
    todoStore.set(agentName, list);
  }
  return list;
}

/**
 * Generate a new monotonically-increasing id for the given agent's list.
 */
function nextId(agentName: string): string {
  const current = idCounters.get(agentName) ?? 0;
  const next = current + 1;
  idCounters.set(agentName, next);
  return String(next);
}

/**
 * Format a single todo entry for human-readable output.
 */
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

// ─── todo_add ────────────────────────────────────────────────────────────────

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
      return {
        output: `Added todo #${item.id}: ${item.content}`,
        metadata: { id: item.id, totalItems: list.length },
      };
    },
  });
}

// ─── todo_complete ───────────────────────────────────────────────────────────

const todoCompleteParams = z.object({
  id: z.string().min(1).describe("The id of the todo item to mark as completed."),
});

/**
 * Create the `todo_complete` tool, which marks an item complete and returns
 * the next pending item (or a "all done" message).
 */
export function createTodoCompleteTool(): ToolDefinition<typeof todoCompleteParams> {
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
        return {
          output: `No todo item with id #${validatedArguments.id} was found.`,
          metadata: { found: false },
        };
      }
      if (target.status !== "completed") {
        target.status = "completed";
        target.completedAt = new Date().toISOString();
      }
      const next = list.find((entry) => entry.status === "pending");
      const remaining = list.filter((entry) => entry.status === "pending").length;
      const output = next
        ? `Completed #${target.id}. Next: ${formatItem(next)} (${remaining} remaining)`
        : `Completed #${target.id}. All todos are done.`;
      return {
        output,
        metadata: {
          completedId: target.id,
          nextId: next?.id ?? null,
          remaining,
        },
      };
    },
  });
}

// ─── todo_get ────────────────────────────────────────────────────────────────

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
        return { output: "[No todo items]", metadata: { totalItems: 0 } };
      }
      const lines = list.map(formatItem);
      const pending = list.filter((entry) => entry.status === "pending").length;
      return {
        output: `${lines.join("\n")}\n\n[${pending} pending / ${list.length} total]`,
        metadata: { totalItems: list.length, pending },
      };
    },
  });
}

// ─── todo_get_next ───────────────────────────────────────────────────────────

const todoGetNextParams = z.object({});

/**
 * Create the `todo_get_next` tool, which returns the next pending todo item.
 */
export function createTodoGetNextTool(): ToolDefinition<typeof todoGetNextParams> {
  return defineTool({
    description:
      "Get the next pending todo item without modifying the list. " +
      "Returns a message indicating no pending items if the list is exhausted.",
    parameters: todoGetNextParams,
    execute: async (_validatedArguments, toolContext) => {
      const list = getList(toolContext.agentName);
      const next = list.find((entry) => entry.status === "pending");
      if (!next) {
        return {
          output: "[No pending todo items]",
          metadata: { hasNext: false },
        };
      }
      return {
        output: formatItem(next),
        metadata: { hasNext: true, id: next.id },
      };
    },
  });
}

// ─── todo_clear ──────────────────────────────────────────────────────────────

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
      return {
        output: `Cleared ${previousLength} todo item(s).`,
        metadata: { cleared: previousLength },
      };
    },
  });
}
