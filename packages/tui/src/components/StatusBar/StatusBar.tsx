import { Box, type DOMElement, Text } from "ink";
import Spinner from "ink-spinner";
import { useRef } from "react";

import type { ChatStatus } from "../../hooks/useChat/useChat.types";
import { useDebugRender } from "../../hooks/useDebugRender";
import { useMouseClick } from "../../hooks/useMouseClick";
import type { StatusBarTheme } from "./StatusBar.theme";
import { useStatusBarTheme } from "./StatusBar.theme";

/**
 * Props for {@link StatusBar}.
 */
export interface StatusBarProps {
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly strategyName?: string;
  readonly mcpEnabled?: number;
  readonly mcpTotal?: number;
  readonly onMcpPress?: () => void;
}

/** Compact status bar displayed at the bottom of the chat. */
export function StatusBar({
  status,
  error,
  strategyName,
  mcpEnabled,
  mcpTotal,
  onMcpPress,
}: StatusBarProps): React.ReactElement {
  const debug = useDebugRender("StatusBar", {
    props: { status, error, strategyName },
  });
  const theme = useStatusBarTheme();

  return (
    <StatusBarRender
      status={status}
      error={error}
      strategyName={strategyName}
      mcpEnabled={mcpEnabled ?? 0}
      mcpTotal={mcpTotal ?? 0}
      onMcpPress={onMcpPress}
      showMcp={mcpEnabled !== undefined || mcpTotal !== undefined}
      theme={theme}
      debugRef={debug.ref}
    />
  );
}

/**
 * Props for {@link StatusBarRender}.
 *
 * Pure render props — all hook-derived values are computed by the
 * container and passed down.
 */
export interface StatusBarRenderProps {
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly strategyName?: string;
  readonly mcpEnabled: number;
  readonly mcpTotal: number;
  readonly onMcpPress?: () => void;
  readonly showMcp: boolean;
  readonly theme: StatusBarTheme;
  readonly debugRef: React.RefObject<unknown>;
}

export function StatusBarRender({
  status,
  error,
  strategyName,
  theme,
  debugRef,
  mcpEnabled,
  mcpTotal,
  onMcpPress,
  showMcp,
}: StatusBarRenderProps): React.ReactElement {
  const info = theme.statusMap[status];
  const mcpRef = useRef<DOMElement | null>(null);
  useMouseClick({ ref: mcpRef, onClick: () => onMcpPress?.() });

  return (
    <Box ref={debugRef} {...theme.container}>
      {info.spinning ? (
        <Text color={info.color}>
          <Spinner type="dots" />
        </Text>
      ) : null}
      <Text {...theme.statusLabel} color={info.color}>
        [{info.label}]
      </Text>
      {strategyName ? (
        <Text {...theme.strategyName}>{strategyName}</Text>
      ) : null}
      {error ? <Text {...theme.errorText}> {error}</Text> : null}
      {showMcp ? (
        <Box ref={mcpRef} marginLeft={1}>
          <Text color={mcpEnabled > 0 ? info.color : undefined}>
            [MCP {mcpEnabled}/{mcpTotal}]
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
