import { Box, Text } from "ink";
import Spinner from "ink-spinner";

import { useDebugRender } from "../../hooks/useDebugRender";
import { useStatusBarTheme } from "./StatusBar.theme";
import type { StatusBarProps, StatusBarRenderProps } from "./StatusBar.types";

/** Compact status bar displayed at the bottom of the chat. */
export function StatusBar({
  status,
  error,
  strategyName,
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
      theme={theme}
      debugRef={debug.ref}
    />
  );
}

export function StatusBarRender({
  status,
  error,
  strategyName,
  theme,
  debugRef,
}: StatusBarRenderProps): React.ReactElement {
  const info = theme.statusMap[status];

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
    </Box>
  );
}
