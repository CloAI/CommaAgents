import type { DelegateJsonValue, SubagentTarget } from "./delegate.types";

/**
 * Compose the first message a subagent receives from the task's goal and context.
 * @param {string} goal - What the subagent must accomplish.
 * @param {string} context - Background the subagent needs.
 * @returns {string} Markdown input for the subagent.
 */
export function taskInput(goal: string, context: string): string {
  return context.trim().length > 0
    ? `## Goal\n${goal.trim()}\n\n## Context\n${context.trim()}`
    : `## Goal\n${goal.trim()}`;
}

/**
 * Parse a final answer as JSON when it is an object or array, optionally inside one code fence.
 * @param {string} text - The subagent's final answer.
 * @returns {DelegateJsonValue | undefined} The parsed value, or undefined for prose.
 */
export function parseStructuredAnswer(
  text: string,
): DelegateJsonValue | undefined {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/.exec(text.trim());
  const trimmed = (fenced?.[1] ?? text).trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }
  try {
    const parsed: DelegateJsonValue = JSON.parse(trimmed);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * System prompt section listing the subagents an agent may delegate to.
 * @param {readonly SubagentTarget[]} subagents - The agent's subagents.
 * @returns {string} Prompt text.
 */
export function describeSubagents(
  subagents: readonly SubagentTarget[],
): string {
  const lines = subagents.map((subagent) =>
    subagent.description
      ? `- ${subagent.name}: ${subagent.description}`
      : `- ${subagent.name}`,
  );
  return [
    "Subagents you can hand work to:",
    ...lines,
    "",
    "Each subagent starts with fresh context and cannot see this conversation, ask the user questions, or read your todo list. Put everything it needs in `goal` and `context`: paths, symbols, constraints, and what form the answer should take.",
    "Tasks in one call run in parallel; batch independent tasks into a single call. Delegate when the work would otherwise flood your context (broad searches, research) or benefits from a fresh perspective (verification). Do small lookups yourself.",
  ].join("\n");
}
