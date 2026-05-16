import { Box, Text, useInput } from "ink";
import type React from "react";
import { useModal } from "../../hooks/useModal";

import { useModalTheme } from "./Modal.theme";

/** Size as absolute columns/rows (number) or a percentage of the terminal. */
export type ModalSize = number | `${number}%`;

/** Raw mode check for safe `useInput` activation. */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

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
  /** Override the theme's default minHeight on the content box. */
  readonly minHeight?: ModalSize;
  /** Override the theme's default maxHeight on the content box. */
  readonly maxHeight?: ModalSize;
}

/**
 * Full-screen overlay modal for the TUI.
 *
 * Renders the modal content box when open. The backdrop dimming and overlay
 * centering are handled externally by {@link AlphaDim} — `Modal` is
 * responsible only for its content box and Esc-to-close behaviour.
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
 * <AlphaDim
 *   isActive={confirm.isOpen}
 *   background={<AppContent />}
 *   overlay={
 *     <Modal modalId="confirm" title="Are you sure?" width="60%">
 *       <Text>This action cannot be undone.</Text>
 *     </Modal>
 *   }
 * />
 *
 * // open from anywhere:
 * confirm.open();
 * ```
 */
export function Modal({
  modalId,
  title,
  children,
  closeOnEsc = true,
  minHeight,
  maxHeight,
}: ModalProps): React.ReactElement | null {
  const { isOpen, isTopmost, close } = useModal(modalId);

  useInput(
    (_input, key) => {
      if (key.escape) close();
    },
    { isActive: isOpen && isTopmost && closeOnEsc && RAW_MODE_SUPPORTED },
  );

  if (!isOpen) return null;

  return (
    <ModalRender title={title} minHeight={minHeight} maxHeight={maxHeight}>
      {children}
    </ModalRender>
  );
}

export interface ModalRenderProps {
  /** Optional title displayed at the top of the modal. */
  readonly title?: string;
  /** Content rendered inside the modal body. */
  readonly children: React.ReactNode;
  /** Debug render ref to attach to the root Box. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
  /** Override the theme's default minHeight on the content box. */
  readonly minHeight?: ModalSize;
  /** Override the theme's default maxHeight on the content box. */
  readonly maxHeight?: ModalSize;
}

export function ModalRender({
  title,
  children,
  minHeight,
  maxHeight,
}: ModalRenderProps): React.ReactElement {
  const theme = useModalTheme();
  const contentStyle: BoxProps = {
    ...theme.content,
    ...(minHeight !== undefined ? { minHeight } : {}),
    ...(maxHeight !== undefined ? { maxHeight } : {}),
  };
  return (
    <Box {...theme.overlay}>
      <Box {...contentStyle}>
        {title !== undefined ? <Text {...theme.title}>{title}</Text> : null}
        {children}
      </Box>
    </Box>
  );
}
