import { Box, type BoxProps, Text, useInput } from "ink";
import React from "react";
import { useModal } from "../../hooks/useModal";

import { useModalTheme } from "./Modal.theme";
import type { ModalSize } from "./Modal.types";

export interface ModalProps {
  /** Unique identifier that ties this modal to `useModal(id)` controls. */
  readonly modalId: string;
  /** Optional title displayed at the top of the modal. */
  readonly title?: string;
  /** Content rendered inside the modal body. */
  readonly children: React.ReactNode;
  /**
   * Close the modal when Esc is pressed. Only triggers when this modal is
   * topmost. @default true
   */
  readonly closeOnEsc?: boolean;
  /** Override the theme's content width. */
  readonly width?: ModalSize;
  /** Override the theme's content height. */
  readonly height?: ModalSize;
  /** Override the theme's minimum content width. */
  readonly minWidth?: ModalSize;
  /** Override the theme's maximum content width. */
  readonly maxWidth?: ModalSize;
  /** Override the theme's default minHeight on the content box. */
  readonly minHeight?: ModalSize;
  /** Override the theme's default maxHeight on the content box. */
  readonly maxHeight?: ModalSize;
}

/**
 * Full-screen overlay modal for the TUI.
 *
 * Renders a centered modal content box over the current TUI frame.
 *
 * Visibility is controlled via `useModal(modalId)`. When `closeOnEsc` is
 * true (the default), the modal listens for Esc — but only when it is the
 * topmost open modal, so nested modals don't all dismiss on one keystroke.
 *
 * @param props - Modal configuration and children.
 * @example
 * ```tsx
 * const confirm = useModal("confirm");
 *
 * <Modal modalId="confirm" title="Are you sure?" width="60%">
 *   <Text>This action cannot be undone.</Text>
 * </Modal>
 *
 * confirm.open();
 * ```
 */
export function Modal({
  modalId,
  title,
  children,
  closeOnEsc = true,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: ModalProps): React.ReactElement | null {
  const { isOpen, isTopmost, close } = useModal(modalId);
  const theme = useModalTheme();

  const handleInput = React.useCallback(
    (_input: string, key: import("ink").Key): void => {
      if (key.escape) close();
    },
    [close],
  );
  useInput(handleInput, {
    isActive: isOpen && isTopmost && closeOnEsc,
  });

  if (!isOpen) return null;

  return (
    <ModalRender
      theme={theme}
      title={title}
      width={width}
      height={height}
      minWidth={minWidth}
      maxWidth={maxWidth}
      minHeight={minHeight}
      maxHeight={maxHeight}
    >
      {children}
    </ModalRender>
  );
}

export interface ModalRenderProps {
  /** Resolved modal theme styles. */
  readonly theme: import("./Modal.theme").ModalTheme;
  /** Optional title displayed at the top of the modal. */
  readonly title?: string;
  /** Content rendered inside the modal body. */
  readonly children: React.ReactNode;
  /** Debug render ref to attach to the root Box. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
  /** Override the theme's content width. */
  readonly width?: ModalSize;
  /** Override the theme's content height. */
  readonly height?: ModalSize;
  /** Override the theme's minimum content width. */
  readonly minWidth?: ModalSize;
  /** Override the theme's maximum content width. */
  readonly maxWidth?: ModalSize;
  /** Override the theme's default minHeight on the content box. */
  readonly minHeight?: ModalSize;
  /** Override the theme's default maxHeight on the content box. */
  readonly maxHeight?: ModalSize;
}

export function ModalRender({
  theme,
  title,
  children,
  debugRef,
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: ModalRenderProps): React.ReactElement {
  const contentStyle: BoxProps = {
    ...theme.content,
    maxWidth:
      maxWidth ?? (width !== undefined ? width : theme.content.maxWidth),
    maxHeight:
      maxHeight ?? (height !== undefined ? height : theme.content.maxHeight),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(minWidth !== undefined ? { minWidth } : {}),
    ...(minHeight !== undefined ? { minHeight } : {}),
  };
  return (
      <Box {...contentStyle}>
        {title !== undefined ? <Text {...theme.title}>{title}</Text> : null}
        {children}
      </Box>
  );
}
