import type { RunDisplayBlock, RunTool } from "./RunSection.types";
import type {
  RunContent,
  RunContextUsage,
  RunUsage,
} from "../../hooks/runs";
import { ACCENT_LIGHTNESS, ACCENT_SATURATION } from "./RunSection.constants";

/**
 * Turn an agent's name into a stable accent color, so the same agent always looks the same.
 * @param {string} agentName - Name of the agent.
 * @returns {string} An hsl color.
 */
export function agentColor(agentName: string): string {
  let hash = 0;
  for (const character of agentName)
    hash = (hash * 31 + character.codePointAt(0)!) % 360;
  return `hsl(${hash} ${ACCENT_SATURATION}% ${ACCENT_LIGHTNESS}%)`;
}

/**
 * Write a response time compactly, such as 850ms, 1.8s, or 2m 05s.
 * @param {number} milliseconds - Elapsed time.
 * @returns {string} The formatted time.
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Write a token count compactly, shortening anything from ten thousand up.
 * @param {number} tokens - Token count.
 * @returns {string} The formatted count.
 */
export function formatTokens(tokens: number): string {
  return tokens < 10_000
    ? tokens.toLocaleString("en-US")
    : `${(tokens / 1000).toFixed(1)}k`;
}

/**
 * Work out how much of the context window the final model step filled.
 * @param {number | undefined} usedTokens - Tokens in the final step's context.
 * @param {number | undefined} contextWindow - Size of the model's context window.
 * @returns {number | undefined} A ratio from 0 to 1, or undefined when either figure is unknown.
 */
export function contextRatio(
  usedTokens: number | undefined,
  contextWindow: number | undefined,
): number | undefined {
  return usedTokens === undefined || !contextWindow
    ? undefined
    : Math.min(1, usedTokens / contextWindow);
}

/**
 * List the input, output, and cached token counts behind a response's total.
 * @param {RunUsage} usage - Tokens across every step.
 * @param {RunContextUsage | undefined} contextUsage - Final-step context usage.
 * @returns {string} One count per line, for a tooltip.
 */
export function tokenBreakdown(
  usage: RunUsage,
  contextUsage: RunContextUsage | undefined,
): string {
  const cached = contextUsage?.inputTokenDetails?.cacheReadTokens;
  return [
    `Input: ${usage.promptTokens.toLocaleString("en-US")}`,
    `Output: ${usage.completionTokens.toLocaleString("en-US")}`,
    ...(cached === undefined
      ? []
      : [`Cached: ${cached.toLocaleString("en-US")}`]),
  ].join("\n");
}

/**
 * Group consecutive calls without letting empty streaming placeholders split them.
 * @param {readonly RunContent[]} content - Original message content in chronological order.
 * @returns {RunDisplayBlock[]} Display blocks preserving original content references.
 */
export function groupRunContent(
  content: readonly RunContent[],
): RunDisplayBlock[] {
  const blocks: RunDisplayBlock[] = [];
  let tools: RunTool[] = [];
  const flush = (): void => {
    if (tools.length === 0) return;
    blocks.push({ type: "tools", key: `tools-${tools[0]!.toolCallId}`, tools });
    tools = [];
  };
  content.forEach((block, index) => {
    if (block.type === "tool") tools.push(block);
    else if (block.text.trim()) {
      flush();
      blocks.push({ type: "content", key: `content-${index}`, content: block });
    }
  });
  flush();
  return blocks;
}
