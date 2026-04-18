import { Box, Text, useInput, useStdout } from "ink";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useDebugRender } from "../../hooks/useDebugRender";

import type { FrameTheme } from "./Frame.theme";
import { useFrameTheme } from "./Frame.theme";

/** Definition of a single tab in the Frame header. */
interface TabDefinition {
  /** Display label for the tab. */
  readonly label: string;
  /** Alt+number shortcut hint (e.g. "Alt+1"). */
  readonly shortcut: string;
}

/** The tabs shown in the Frame header, in order. */
const TABS: readonly TabDefinition[] = [
  { label: "Chat", shortcut: "Alt+1" },
  { label: "Settings", shortcut: "Alt+2" },
  { label: "Logs", shortcut: "Alt+3" },
] as const;

/** Whether stdin supports raw mode (false in piped/non-TTY contexts). */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

export interface FrameProps {
  /** Content rendered in the body area (grows to fill available space). */
  readonly children: React.ReactNode;
  /** Content rendered at the bottom of the frame (pinned). */
  readonly footer?: React.ReactNode;
}

export function Frame({ children, footer }: FrameProps): React.ReactElement {
  const debug = useDebugRender("Frame", { props: { children, footer } });
  const theme = useFrameTheme();
  const { stdout } = useStdout();
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [terminalHeight, setTerminalHeight] = useState(() => stdout?.rows ?? process.stdout.rows);
  const [terminalWidth, setTerminalWidth] = useState(
    () => stdout?.columns ?? process.stdout.columns,
  );

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setTerminalHeight(stdout.rows);
      setTerminalWidth(stdout.columns);
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  useInput(
    (input, key) => {
      if (key.meta && input === "1") setActiveTabIndex(0);
      if (key.meta && input === "2") setActiveTabIndex(1);
      if (key.meta && input === "3") setActiveTabIndex(2);
    },
    { isActive: RAW_MODE_SUPPORTED },
  );

  const handleTabSelect = useCallback((index: number) => {
    setActiveTabIndex(index);
  }, []);

  return (
    <FrameRender
      theme={theme}
      activeTabIndex={activeTabIndex}
      terminalHeight={terminalHeight}
      terminalWidth={terminalWidth}
      onTabSelect={handleTabSelect}
      footer={footer}
      debugRef={debug.ref}
    >
      {children}
    </FrameRender>
  );
}

export interface FrameRenderProps {
  /** Resolved theme style objects. */
  readonly theme: FrameTheme;
  /** Index of the currently active tab. */
  readonly activeTabIndex: number;
  /** Terminal height in rows, used to size the root container. */
  readonly terminalHeight: number;
  /** Terminal width in columns, used for full-width separator. */
  readonly terminalWidth: number;
  /** Called when a tab is selected by index. */
  readonly onTabSelect: (index: number) => void;
  /** Content rendered in the body area for the active tab. */
  readonly children: React.ReactNode;
  /** Content rendered at the bottom of the frame (pinned). */
  readonly footer?: React.ReactNode;
  /** Debug render ref to attach to root Box. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

export function FrameRender({
  theme,
  activeTabIndex,
  terminalHeight,
  terminalWidth,
  children,
  footer,
  debugRef,
}: FrameRenderProps): React.ReactElement {
  const activeTab = TABS[activeTabIndex];
  if (!activeTab) {
    throw new Error(`Invalid tab index: ${activeTabIndex}`);
  }

  return (
    <Box ref={debugRef} {...theme.root} height={terminalHeight}>
      {/* Tab bar */}
      <Box {...theme.tabBar}>
        {TABS.map((tab, index) => {
          const isActive = index === activeTabIndex;
          return (
            <Box key={tab.label} gap={1}>
              <Text {...(isActive ? theme.activeTab : theme.inactiveTab)}>{tab.label}</Text>
              <Text {...theme.tabHint}>{tab.shortcut}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Separator */}
      <Box {...theme.separator}>
        <Text {...theme.separator.text}>
          {theme.separator.char.repeat(Math.max(0, terminalWidth - theme.separator.paddingX * 2))}
        </Text>
      </Box>

      {/* Content (grows to fill available space) */}
      <Box {...theme.content}>
        {activeTabIndex === 0 ? children : null}
        {activeTabIndex === 1 ? (
          <Box paddingX={1}>
            <Text dimColor>Settings — coming soon</Text>
          </Box>
        ) : null}
        {activeTabIndex === 2 ? (
          <Box paddingX={1}>
            <Text dimColor>Logs — coming soon</Text>
          </Box>
        ) : null}
      </Box>

      {/* Footer (pinned to bottom) */}
      {footer ? <Box {...theme.footer}>{footer}</Box> : null}
    </Box>
  );
}
