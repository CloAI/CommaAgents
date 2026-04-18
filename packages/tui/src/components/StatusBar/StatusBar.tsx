import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import type { ChatStatus } from "../../hooks/useChat/useChat.types";
import { useDebugRender } from "../../hooks/useDebugRender";
import { useStatusBarTheme } from "./StatusBar.theme";

interface StatusBarProps {
  readonly status: ChatStatus;
  readonly error: string | null;
  readonly strategyName?: string;
}

/** Compact status bar displayed at the bottom of the chat. */
export function StatusBar({ status, error, strategyName }: StatusBarProps) {
  const debug = useDebugRender("StatusBar", { props: { status, error, strategyName } });
  const theme = useStatusBarTheme();
  const info = theme.statusMap[status];

  return (
    <Box ref={debug.ref} {...theme.container}>
      {info.spinning ? (
        <Text color={info.color}>
          <Spinner type="dots" />
        </Text>
      ) : null}
      <Text {...theme.statusLabel} color={info.color}>
        [{info.label}]
      </Text>
      {strategyName ? <Text {...theme.strategyName}>{strategyName}</Text> : null}
      {error ? <Text {...theme.errorText}> {error}</Text> : null}
    </Box>
  );
}
