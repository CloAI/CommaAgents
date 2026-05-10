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
    <ModalRender title={title}>
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
}

/**
 * Presentational form of `Modal` — the themed content box with optional title.
 *
 * Backdrop dimming and centering are handled by {@link AlphaDim} at a higher
 * level; this component renders only the bordered inner box.
 */
export function ModalRender({
  title,
  children,
}: ModalRenderProps): React.ReactElement {
  const theme = useModalTheme();
  return (
    <Box {...theme.overlay}>
      <Box {...theme.content}>
        {title !== undefined ? (
          <Text {...theme.title}>{title}</Text>
        ) : null}
        {children}
      </Box>
    </Box>
  );
}
