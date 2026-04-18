import { Box, Text, useStdout } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { useDebugRender } from "../../hooks/useDebugRender";
import { useModal } from "../../hooks/useModal";

import type { ModalTheme } from "./Modal.theme";
import { useModalTheme } from "./Modal.theme";

export interface ModalProps {
  /** Unique identifier that ties this modal to `useModal(id)` controls. */
  readonly modalId: string;
  /** Optional title displayed at the top of the modal. */
  readonly title?: string;
  /** Content rendered inside the modal body. */
  readonly children: React.ReactNode;
  /** Width of the modal content box (defaults to 50% of terminal width). */
  readonly width?: number;
  /** Height of the modal content box (defaults to auto). */
  readonly height?: number;
}

/**
 * A full-screen overlay modal for the TUI.
 *
 * Renders an absolute-positioned backdrop that grays out the background
 * and centers its children. Visibility is controlled via the `useModal`
 * hook with the matching `modalId`.
 *
 * @param props - Modal configuration and children.
 * @example
 * ```tsx
 * const confirm = useModal("confirm");
 *
 * <Modal modalId="confirm" title="Are you sure?">
 *   <Text>This action cannot be undone.</Text>
 * </Modal>
 *
 * // open from anywhere:
 * confirm.open();
 * ```
 */
export function Modal(props: ModalProps): React.ReactElement | null {
  const { modalId, title, children, width, height } = props;
  const debug = useDebugRender("Modal", { props: { modalId, title, width, height } });
  const theme = useModalTheme();
  const { isOpen } = useModal(modalId);
  const { stdout } = useStdout();

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

  if (!isOpen) {
    return null;
  }

  const contentWidth = width ?? Math.floor(terminalWidth * 0.5);

  return (
    <ModalRender
      theme={theme}
      title={title}
      terminalHeight={terminalHeight}
      terminalWidth={terminalWidth}
      contentWidth={contentWidth}
      contentHeight={height}
      debugRef={debug.ref}
    >
      {children}
    </ModalRender>
  );
}

export interface ModalRenderProps {
  /** Resolved theme style objects. */
  readonly theme: ModalTheme;
  /** Optional title displayed at the top of the modal. */
  readonly title?: string;
  /** Terminal height in rows. */
  readonly terminalHeight: number;
  /** Terminal width in columns. */
  readonly terminalWidth: number;
  /** Width of the modal content box. */
  readonly contentWidth: number;
  /** Height of the modal content box (omit for auto). */
  readonly contentHeight?: number;
  /** Content rendered inside the modal body. */
  readonly children: React.ReactNode;
  /** Debug render ref to attach to root Box. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

export function ModalRender(props: ModalRenderProps): React.ReactElement {
  const {
    theme,
    title,
    terminalHeight,
    terminalWidth,
    contentWidth,
    contentHeight,
    children,
    debugRef,
  } = props;

  return (
    <Box
      ref={debugRef}
      {...theme.backdrop}
      width={terminalWidth}
      height={terminalHeight}
    >
      {/* Dimmed background fill — Ink doesn't support alpha, so we fill with dim characters */}
      <Box
        position="absolute"
        width={terminalWidth}
        height={terminalHeight}
      >
        <Text dimColor color={theme.backdropColor}>
          {Array.from({ length: terminalHeight })
            .map(() => " ".repeat(terminalWidth))
            .join("\n")}
        </Text>
      </Box>

      {/* Modal content */}
      <Box
        {...theme.content}
        width={contentWidth}
        height={contentHeight}
      >
        {title ? (
          <Box marginBottom={1}>
            <Text {...theme.title}>{title}</Text>
          </Box>
        ) : null}
        {children}
      </Box>
    </Box>
  );
}
