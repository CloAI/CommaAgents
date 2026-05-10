import { Box, type DOMElement, Text, useStdout } from "ink";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useDebugRender } from "../../hooks/useDebugRender";
import { useMouseClick } from "../../hooks/useMouseClick";
import { useMouseHover } from "../../hooks/useMouseHover";
import { MouseProvider } from "../MouseProvider";
import { Separator } from "../Separator";

import type { FrameTheme } from "./Frame.theme";
import { useFrameTheme } from "./Frame.theme";

/** Definition of a single tab in the Frame header. */
export interface TabDefinition {
  /** Route path this tab navigates to (e.g. "/chat"). */
  readonly path: string;
  /** Display label for the tab. */
  readonly label: string;
  /** Alt+number shortcut hint (e.g. "Alt+1"). */
  readonly shortcut: string;
}

export interface FrameProps {
  /**
   * The route path of the currently active tab. Should match one of the
   * `path` values in `tabs`. Used to highlight the correct tab header.
   */
  readonly activeTabPath: string;
  /** Tab definitions to render in the header. */
  readonly tabs: readonly TabDefinition[];
  /** Called when the user selects a tab (by keyboard or click). */
  readonly onTabSelect: (path: string) => void;
  /** Content to render in the body area (the active page). */
  readonly children: React.ReactNode;
  /** Content rendered at the bottom of the frame (pinned). */
  readonly footer?: React.ReactNode;
}

export function Frame({
  activeTabPath,
  tabs,
  onTabSelect,
  children,
  footer,
}: FrameProps): React.ReactElement {
  const debug = useDebugRender("Frame", {
    props: { activeTabPath, tabs },
  });
  const theme = useFrameTheme();
  const { stdout } = useStdout();
  const [terminalSize, setTerminalSize] = useState(() => ({
    rows: stdout?.rows ?? process.stdout.rows,
    columns: stdout?.columns ?? process.stdout.columns,
  }));

  useEffect(() => {
    if (!stdout) return;
    const handleResize = () =>
      setTerminalSize({ rows: stdout.rows, columns: stdout.columns });
    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  // Enable SGR mouse mode so the terminal reports click events.
  useEffect(() => {
    process.stdout.write("\x1b[?1000h\x1b[?1006h");
    return () => {
      process.stdout.write("\x1b[?1000l\x1b[?1006l");
    };
  }, []);

  return (
    <MouseProvider>
      <FrameRender
        theme={theme}
        activeTabPath={activeTabPath}
        tabs={tabs}
        terminalHeight={terminalSize.rows}
        terminalWidth={terminalSize.columns}
        onTabSelect={onTabSelect}
        footer={footer}
        debugRef={debug.ref}
      >
        {children}
      </FrameRender>
    </MouseProvider>
  );
}

export interface FrameRenderProps {
  /** Resolved theme style objects. */
  readonly theme: FrameTheme;
  /** Route path of the currently active tab. */
  readonly activeTabPath: string;
  /** Tab definitions to render in the header. */
  readonly tabs: readonly TabDefinition[];
  /** Terminal height in rows, used to size the root container. */
  readonly terminalHeight: number;
  /** Terminal width in columns, used to size the root container. */
  readonly terminalWidth: number;
  /** Called when a tab is selected. */
  readonly onTabSelect: (path: string) => void;
  /** Content to render in the body area. */
  readonly children: React.ReactNode;
  /** Content rendered at the bottom of the frame (pinned). */
  readonly footer?: React.ReactNode;
  /** Debug render ref to attach to root Box. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

export function FrameRender({
  theme,
  activeTabPath,
  tabs,
  terminalHeight,
  terminalWidth,
  onTabSelect,
  children,
  footer,
  debugRef,
}: FrameRenderProps): React.ReactElement {
  return (
    <Box
      ref={debugRef}
      {...theme.root}
      width={terminalWidth}
      height={terminalHeight}
      flexDirection="column"
    >
      {/* Tab bar */}
      <Box {...theme.tabBar}>
        {tabs.map((tab) => (
          <FrameTab
            key={tab.path}
            tab={tab}
            isActive={tab.path === activeTabPath}
            theme={theme}
            onSelect={onTabSelect}
          />
        ))}
      </Box>

      {/* Separator */}
      <Separator />

      {/* Content (grows to fill available space) */}
      <Box {...theme.content}>{children}</Box>

      {/* Footer (pinned to bottom) */}
      {footer ? <Box {...theme.footer}>{footer}</Box> : null}
    </Box>
  );
}

/** Props for the {@link FrameTab} subcomponent. */
interface FrameTabProps {
  /** Tab definition (path / label / shortcut). */
  readonly tab: TabDefinition;
  /** Whether this tab matches the current active path. */
  readonly isActive: boolean;
  /** Resolved Frame theme — supplies active/inactive/hovered styles. */
  readonly theme: FrameTheme;
  /** Called with the tab's `path` when the user clicks the row. */
  readonly onSelect: (path: string) => void;
}

/**
 * Single clickable tab in the Frame header.
 *
 * Hovering highlights the row by overlaying {@link FrameTheme.hoveredTab} on
 * top of the active/inactive base style, so the user gets visual affordance
 * before clicking. Left-click selects the tab. The whole row (label +
 * shortcut hint) is the hit target so the cursor doesn't have to land on the
 * label glyphs precisely.
 */
function FrameTab({
  tab,
  isActive,
  theme,
  onSelect,
}: FrameTabProps): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const { isHovered } = useMouseHover({ ref });
  useMouseClick({ ref, onClick: () => onSelect(tab.path) });

  const baseLabelStyle = isActive ? theme.activeTab : theme.inactiveTab;
  // When hovered, merge the hover style on top so color/bold win without
  // clobbering underline (active) or dimColor (inactive).
  const labelStyle = isHovered
    ? { ...baseLabelStyle, ...theme.hoveredTab }
    : baseLabelStyle;

  return (
    <Box ref={ref} gap={1}>
      <Text {...labelStyle}>{tab.label}</Text>
      {/* TODO: maybe remove the shortcut: <Text {...theme.tabHint}>{tab.shortcut}</Text> */}
    </Box>
  );
}
