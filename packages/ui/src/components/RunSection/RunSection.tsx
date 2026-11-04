import { memo } from "react";
import type { RunChild, RunMessage } from "../../hooks/runs";
import { MarkdownBlock } from "./Blocks/MarkdownBlock";
import { ReasoningBlock } from "./Blocks/ReasoningBlock";
import { ToolGroupBlock, groupRunContent } from "./Blocks/ToolGroupBlock";
import styles from "./RunSection.module.scss";
import { ContextMeter } from "./ContextMeter";
import { useElapsed } from "./useElapsed";
import {
  agentColor,
  formatDuration,
  formatTokens,
  tokenBreakdown,
} from "./RunSection.utils";

/** The message to show. */
export interface RunSectionProps {
  /** One agent invocation, or one message from the user. */
  readonly message: RunMessage;
  /** Child runs of the whole run; each tool call shows the ones it launched. */
  readonly childRuns?: readonly RunChild[];
  /** Open a child run to see what it is doing. */
  readonly onOpenChild?: (child: RunChild) => void;
}

/**
 * Show one message as its own card, headed by who produced it.
 * @param {RunSectionProps} props - Component properties.
 * @returns {React.ReactElement} The section.
 */
export const RunSection = memo(function RunSection({
  message,
  childRuns,
  onOpenChild,
}: RunSectionProps) {
  const agent = message.role === "agent" ? message : undefined;
  const name = agent ? agent.agentName : "You";
  const accent = agent ? agentColor(name) : undefined;
  const elapsed = useElapsed(
    message.createdAt,
    agent?.completedAt,
    message.streaming,
  );
  if (message.role === "strategy") {
    return (
      <p className={styles.strategyChange}>
        {message.content
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("")}
      </p>
    );
  }
  return (
    <article
      className={styles.runSection}
      data-role={message.role}
      data-streaming={message.streaming ? "" : undefined}
      aria-label={name}
    >
      <span
        className={styles.accent}
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div className={styles.body}>
        <header className={styles.header}>
          <span className={styles.role}>{message.role}</span>
          <span className={styles.name} style={{ color: accent }}>
            {name}
          </span>
          {message.streaming && (
            <span className={styles.live} style={{ color: accent }}>
              <span className={styles.dots} aria-hidden>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </span>
              Streaming
            </span>
          )}
          {agent?.cancellationReason === "user_steering" ? (
            <span className={styles.interrupted}>Interrupted by steering</span>
          ) : (
            agent?.interruption && (
              <span
                className={styles.interrupted}
                data-outcome={agent.interruption}
              >
                {agent.interruption}
              </span>
            )
          )}
          <span className={styles.meta}>
            {agent?.model && <span>{agent.model}</span>}
            {elapsed !== undefined && <span>{formatDuration(elapsed)}</span>}
            {agent?.usage && (
              <span title={tokenBreakdown(agent.usage, agent.contextUsage)}>
                {formatTokens(
                  agent.usage.promptTokens + agent.usage.completionTokens,
                )}{" "}
                tok
              </span>
            )}
            <ContextMeter
              usedTokens={agent?.contextUsage?.totalTokens}
              contextWindow={agent?.contextWindow}
            />
            <time dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </span>
        </header>
        <div className={styles.blocks}>
          {groupRunContent(message.content).map((block) =>
            block.type === "tools" ? (
              <ToolGroupBlock
                key={block.key}
                tools={block.tools}
                childRuns={childRuns?.filter(
                  (child) =>
                    child.sourceMessageId === message.id &&
                    block.tools.some(
                      (tool) => tool.toolCallId === child.toolCallId,
                    ),
                )}
                onOpenChild={onOpenChild}
              />
            ) : block.content.type === "text" ? (
              <MarkdownBlock key={block.key} text={block.content.text} />
            ) : (
              <ReasoningBlock key={block.key} text={block.content.text} />
            ),
          )}
        </div>
      </div>
    </article>
  );
});
