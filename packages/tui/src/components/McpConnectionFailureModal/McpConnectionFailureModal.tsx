import type { McpServerStatusWire } from "@comma-agents/daemon";
import { Box, Text, useInput } from "ink";
import React from "react";

import { useChatRunLifecycle, useChatState } from "../../hooks/useChat";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../Modal";

export const MCP_CONNECTION_FAILURE_MODAL_ID = "mcp-connection-failure";

export interface McpConnectionFailureModalProps {
  readonly chatRunId: string;
}

export function McpConnectionFailureModal({
  chatRunId,
}: McpConnectionFailureModalProps): React.ReactElement {
  const chatState = useChatState(chatRunId);
  const { confirmMcpPreparation } = useChatRunLifecycle();
  const modal = useModal(MCP_CONNECTION_FAILURE_MODAL_ID);
  const failedServers = chatState.mcpServers.filter(
    (server) => server.enabled && server.connected === false,
  );

  React.useEffect(() => {
    if (chatState.pendingMcpConfirmation === modal.isOpen) return;
    if (chatState.pendingMcpConfirmation) modal.open();
    else modal.close();
  }, [chatState.pendingMcpConfirmation, modal.isOpen, modal.close, modal.open]);

  useInput(
    (_input, key) => {
      if (key.return) {
        confirmMcpPreparation(chatRunId, true);
        modal.close();
      } else if (key.escape) {
        confirmMcpPreparation(chatRunId, false);
        modal.close();
      }
    },
    { isActive: modal.isOpen && modal.isTopmost },
  );

  return (
    <Modal
      modalId={MCP_CONNECTION_FAILURE_MODAL_ID}
      title="MCP connection failures"
      closeOnEsc={false}
    >
      <McpConnectionFailureModalRender failedServers={failedServers} />
    </Modal>
  );
}

export interface McpConnectionFailureModalRenderProps {
  /** Enabled MCP servers that failed to connect during run preparation. */
  readonly failedServers: readonly McpServerStatusWire[];
}

/** Presentational content shown inside the MCP connection failure modal. */
export function McpConnectionFailureModalRender({
  failedServers,
}: McpConnectionFailureModalRenderProps): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Text>The run can continue without the following MCP servers:</Text>
      {failedServers.map((server) => (
        <Box key={server.id} flexDirection="column">
          <Text bold>{server.id}</Text>
          <Text dimColor>{server.error ?? "Connection failed"}</Text>
        </Box>
      ))}
      <Text dimColor>Enter to continue · Esc to cancel the run</Text>
    </Box>
  );
}
