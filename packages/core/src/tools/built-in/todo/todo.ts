import { z } from "zod";

import { defineTool } from "../../define/define-tool";
import { okResult } from "../../result";
import type { ToolContext, ToolDefinition } from "../../tool.types";
import type { TodoItem } from "./todo.types";

// The store is process-global. We key on a composite of
// `runId` (when present) plus `agentName` so each strategy
// invocation gets its own silo, isolated from:
//
//   - other top-level runs in the same daemon process
//   - recursive `launch_strategy` sub-runs (which the daemon
//     gives a fresh derived `runId` per invocation)
//   - sibling agents in *other* runs that happen to share the
//     same name (e.g., two "manager" agents in two different
//     runs)
//
// Sibling agents *within* one run still share a key by
// `agentName` only (because they share the same `runId`), which
// is the original intra-run behaviour. When `runId` is absent
// (tests, embedded callers without a daemon) we fall back to
// pure `agentName` keying for backwards compatibility.
const todoStore = new Map<string, TodoItem[]>();
const idCounters = new Map<string, number>();

/**
 * Build the store key for a tool invocation.
 *
 * `runId` is the per-invocation discriminator the daemon
 * supplies; falling back to `agentName`-only keeps the legacy
 * behaviour for callers (tests, plain `loadStrategy` users)
 * that don't pass one.
 */
function storeKey(context: Pick<ToolContext, "agentName" | "runId">): string {
  return context.runId === undefined
    ? context.agentName
    : `${context.runId}:${context.agentName}`;
}

function getList(key: string): TodoItem[] {
  let list = todoStore.get(key);
  if (!list) {
    list = [];
    todoStore.set(key, list);
  }
  return list;
}

function nextId(key: string): string {
  const current = idCounters.get(key) ?? 0;
  const next = current + 1;
  idCounters.set(key, next);
  return String(next);
}

function formatItem(item: TodoItem): string {
  const marker = item.status === "completed" ? "[x]" : "[ ]";
  return `${marker} #${item.id}: ${item.content}`;
}

/**
 * Reset the todo state for a single agent (by raw store key — typically
 * `agentName` for legacy callers or `${runId}:${agentName}` when a runId
 * is supplied). Exposed for tests and embedders.
 */
export function resetTodoStateForAgent(key: string): void {
  todoStore.delete(key);
  idCounters.delete(key);
}

/**
 * Reset all todo state across all agents and runs. Exposed for tests.
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
      const key = storeKey(toolContext);
      const list = getList(key);
      const item: TodoItem = {
        id: nextId(key),
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
      const list = getList(storeKey(toolContext));
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
      const list = getList(storeKey(toolContext));
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
      const list = getList(storeKey(toolContext));
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
      const key = storeKey(toolContext);
      const previousLength = getList(key).length;
      resetTodoStateForAgent(key);
      return okResult(`Cleared ${previousLength} todo item(s).`, {
        metadata: { cleared: previousLength },
      });
    },
  });
}
