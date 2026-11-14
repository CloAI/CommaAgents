import { Wrench } from "lucide-react";
import type { RunChild, RunContent } from "../../../../hooks/runs";
import { ToolChildren } from "./ToolChildren";
import { CodeBlock } from "../CodeBlock";
import styles from "./ToolBlock.module.scss";

/**
 * Pretty-print a value as JSON, showing newlines inside strings as real line breaks.
 * @param {unknown} value - Arguments or output of a tool call.
 * @returns {string} Indented JSON text.
 */
function formatJson(value: unknown): string {
  return (JSON.stringify(value, null, 2) ?? "").replace(
    /\\(\\|n)/g,
    (match, escaped: string) => (escaped === "n" ? "\n" : match),
  );
}

/** The tool call to show. */
export interface ToolBlockProps {
  /** Tool block with its arguments and, once finished, its output. */
  readonly tool: Extract<RunContent, { type: "tool" }>;
  /** Subagents or strategies this tool call launched. */
  readonly childRuns?: readonly RunChild[];
  /** Open a launched child run to see what it is doing. */
  readonly onOpenChild?: (child: RunChild) => void;
}

/**
 * Show a tool call's name and status, with its arguments and output on demand, and the subagents it launched.
 * @param {ToolBlockProps} props - Component properties.
 * @returns {React.ReactElement} The tool call.
 */
export function ToolBlock({ tool, childRuns, onOpenChild }: ToolBlockProps) {
  return (
    <div className={styles.toolCall}>
      <details className={styles.toolBlock} data-status={tool.status}>
        <summary className={styles.summary}>
          <Wrench size={14} aria-hidden />
          <span className={styles.name}>{tool.toolName}</span>
          {tool.mcp && (
            <span className={styles.server}>{tool.mcp.serverId}</span>
          )}
          <span className={styles.status}>
            {tool.cancellationReason === "user_steering"
              ? "Cancelled by steering"
              : tool.cancellationRequestedBy === "user_steering"
                ? `${tool.status} (cancellation requested)`
                : tool.status}
          </span>
        </summary>
        <div className={styles.details}>
          <span className={styles.label}>Arguments</span>
          <CodeBlock language="json" bodyClassName={styles.json}>
            <code>{formatJson(tool.arguments)}</code>
          </CodeBlock>
          {(tool.status === "completed" || tool.status === "failed") && (
            <>
              <span className={styles.label}>Output</span>
              <CodeBlock language="json" bodyClassName={styles.json}>
                <code>{formatJson(tool.output)}</code>
              </CodeBlock>
            </>
          )}
        </div>
      </details>
      <ToolChildren childRuns={childRuns ?? []} onOpenChild={onOpenChild} />
    </div>
  );
}
