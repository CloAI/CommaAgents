import { Box, Text } from "ink";
import type React from "react";

import { useModal } from "../../../hooks/useModal";
import { Modal } from "../../Modal";
import { CONTEXT_USAGE_MODAL_ID } from "./ContextUsageModal.constants";
import type { ContextUsageModalPayload } from "./ContextUsageModal.types";

/** Modal showing the detailed token breakdown behind the context meter. */
export function ContextUsageModal(): React.ReactElement | null {
  const { isOpen, data } = useModal(CONTEXT_USAGE_MODAL_ID);
  const payload = isPayload(data) ? data : null;

  if (!isOpen || payload === null) return null;

  return (
    <Modal
      modalId={CONTEXT_USAGE_MODAL_ID}
      title={`Context Usage: ${payload.agentName}`}
      minHeight={14}
      maxHeight="60%"
    >
      <ContextUsageModalRender payload={payload} />
    </Modal>
  );
}

export interface ContextUsageModalRenderProps {
  /** Context usage details to render. */
  readonly payload: ContextUsageModalPayload;
}

export function ContextUsageModalRender({
  payload,
}: ContextUsageModalRenderProps): React.ReactElement {
  const rows = contextUsageRows(payload);
  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="column">
        {payload.model !== undefined ? (
          <Text color="gray">model {payload.model}</Text>
        ) : null}
        {payload.contextWindow !== undefined ? (
          <Text color="gray">
            window {formatTokens(payload.contextUsage.totalTokens)}/
            {formatTokens(payload.contextWindow)}
          </Text>
        ) : null}
        <Text color="gray" dimColor>
          input = full context sent (system + history + your msg)
        </Text>
        <Text color="gray" dimColor>
          output = the model's generated reply
        </Text>
      </Box>
      <Box flexDirection="column">
        {rows.map((row) => (
          <Text key={row.label}>
            <Text color="gray">{row.label.padEnd(16)}</Text>
            {formatTokens(row.tokens)}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

interface ContextUsageRow {
  readonly label: string;
  readonly tokens: number;
}

/**
 * Build the labeled token rows. Cache details are nested under `input` and
 * text/reasoning under `output` so the breakdown reads top-down and makes it
 * obvious which subtotal belongs to which side.
 */
function contextUsageRows(
  payload: ContextUsageModalPayload,
): readonly ContextUsageRow[] {
  const { contextUsage } = payload;
  const { inputTokenDetails, outputTokenDetails } = contextUsage;
  const rows: ContextUsageRow[] = [
    { label: "total", tokens: contextUsage.totalTokens },
  ];

  if (contextUsage.inputTokens !== undefined) {
    rows.push({ label: "input (sent)", tokens: contextUsage.inputTokens });
  }
  if (inputTokenDetails?.noCacheTokens !== undefined) {
    rows.push({ label: "  no cache", tokens: inputTokenDetails.noCacheTokens });
  }
  if (inputTokenDetails?.cacheReadTokens !== undefined) {
    rows.push({
      label: "  cache read",
      tokens: inputTokenDetails.cacheReadTokens,
    });
  }
  if (inputTokenDetails?.cacheWriteTokens !== undefined) {
    rows.push({
      label: "  cache write",
      tokens: inputTokenDetails.cacheWriteTokens,
    });
  }

  if (contextUsage.outputTokens !== undefined) {
    rows.push({ label: "output (reply)", tokens: contextUsage.outputTokens });
  }
  if (outputTokenDetails?.textTokens !== undefined) {
    rows.push({ label: "  text", tokens: outputTokenDetails.textTokens });
  }
  if (outputTokenDetails?.reasoningTokens !== undefined) {
    rows.push({
      label: "  reasoning",
      tokens: outputTokenDetails.reasoningTokens,
    });
  }

  return rows;
}

function isPayload(value: unknown): value is ContextUsageModalPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<ContextUsageModalPayload>;
  return (
    typeof payload.agentName === "string" &&
    typeof payload.contextUsage === "object" &&
    payload.contextUsage !== null &&
    typeof payload.contextUsage.totalTokens === "number" &&
    (payload.model === undefined || typeof payload.model === "string") &&
    (payload.contextWindow === undefined ||
      typeof payload.contextWindow === "number")
  );
}

function formatTokens(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
  return `${Math.round(tokens / 100_000) / 10}m`;
}
