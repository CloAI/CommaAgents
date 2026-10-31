import { resolve } from "node:path";
import type { ConversationRecord } from "@comma-agents/core";
import type { RunHistoryEntry } from "../messages";
import type { RunConfiguration } from "../preparation/preparation.types";
import type { ContextMessage, RunStrategyState } from "./switching.types";

/** Identify strategies independently of their display names.
 * @param {Pick<RunConfiguration, "strategyPath" | "manifestPath">} configuration - Strategy and project identity.
 * @returns {string} Stable key for conversation-owned settings.
 */
export function strategyKey(
  configuration: Pick<RunConfiguration, "strategyPath" | "manifestPath">,
): string {
  return JSON.stringify([
    resolve(configuration.strategyPath),
    configuration.manifestPath ? resolve(configuration.manifestPath) : null,
  ]);
}

/** Project visible text in invocation order, excluding tools and reasoning.
 * @param {ReadonlyArray<RunHistoryEntry>} entries - Chronological display entries.
 * @returns {ContextMessage[]} Attributed, deduplicated text messages.
 */
export function contextMessages(
  entries: readonly RunHistoryEntry[],
): ContextMessage[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    if (entry.type !== "message" || seen.has(entry.messageId)) return [];
    seen.add(entry.messageId);
    const text = entry.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n");
    if (!text) return [];
    return [
      {
        messageId: entry.messageId,
        speaker: entry.role === "user" ? "user" : entry.agentName,
        text:
          entry.status === "stopped" || entry.status === "failed"
            ? `[${entry.status} partial response]\n${text}`
            : text,
        createdAt: entry.createdAt,
      },
    ];
  });
}

/** Seed a target agent with attributed shared text under stable synthetic IDs.
 * @param {ReadonlyArray<ContextMessage>} messages - Prior conversation text.
 * @param {string} agentName - Target context owner.
 * @param {number} revision - Strategy selection revision.
 * @returns {ConversationRecord[]} Records used only for model context.
 */
export function handoffRecords(
  messages: readonly ContextMessage[],
  agentName: string,
  revision: number,
): ConversationRecord[] {
  return messages.map((message) => ({
    id: `handoff:${revision}:${agentName}:${message.messageId}`,
    agentName,
    createdAt: message.createdAt,
    userMessage: {
      role: "user",
      content: `Prior conversation (${message.speaker}):\n${message.text}`,
    },
    responseMessages: [],
    text: "",
    usage: { promptTokens: 0, completionTokens: 0 },
    finishReason: "stop",
  }));
}

/** Seed a target agent with one record holding the prior conversation and, after a switch, a switch notice.
 * @param {RunStrategyState} state - Shared context, revision, and recorded strategy changes.
 * @param {string} agentName - Target context owner.
 * @returns {ConversationRecord[]} One record used only for model context, or none when nothing was shared.
 */
export function handoffContextRecords(
  state: RunStrategyState,
  agentName: string,
): ConversationRecord[] {
  const { messages } = state.handoff;
  const first = messages[0];
  if (first === undefined) return [];
  const change = state.changes.at(-1);
  const transcript = messages
    .map((message) => `[${message.speaker}]\n${message.text}`)
    .join("\n\n");
  const sections = [
    change === undefined
      ? `<prior_conversation>\n${transcript}\n</prior_conversation>`
      : `<prior_conversation strategy="${change.previousName}">\n${transcript}\n</prior_conversation>`,
  ];
  if (change !== undefined) {
    sections.push(
      `<strategy_switch from="${change.previousName}" to="${change.nextName}">\n` +
        `You are now running the ${change.nextName} strategy. The prior conversation above is reference context; ` +
        `the requests, decisions, and plans in it are your starting point. ` +
        `Follow your current instructions and use only the tools you have now.\n` +
        `</strategy_switch>`,
    );
  }
  return [
    {
      id: `handoff:${state.revision}:${agentName}`,
      agentName,
      createdAt: first.createdAt,
      userMessage: { role: "user", content: sections.join("\n\n") },
      responseMessages: [],
      text: "",
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop",
    },
  ];
}

/** Conservative UTF-8 estimate; provider-reported usage is unavailable on the first handoff.
 * @param {string} text - Text to measure.
 * @returns {number} Estimated tokens, not a provider token count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 3);
}
