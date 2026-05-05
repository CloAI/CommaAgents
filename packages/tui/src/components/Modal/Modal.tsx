import { Box, Text, useInput } from "ink";
import type React from "react";
import { useDebugRender } from "../../hooks/useDebugRender";
import { useModal } from "../../hooks/useModal";
import { MeasuredBox } from "../MeasuredBox";

import type { ModalTheme } from "./Modal.theme";
import { useModalTheme } from "./Modal.theme";
import { resolveSize } from "./Modal.utils";

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
   * Width of the modal content box. Number = columns, string = percentage.
   * @default "80%"
   */
  readonly width?: ModalSize;
  /**
   * Height of the modal content box. Number = rows, string = percentage.
   * @default "80%"
   */
  readonly height?: ModalSize;
  /**
   * Close the modal when Esc is pressed. Only triggers when this modal is
   * topmost. @default true
   */
  readonly closeOnEsc?: boolean;
}

/**
 * Full-screen overlay modal for the TUI.
 *
 * Renders an absolute-positioned backdrop that tints the background using
 * `backgroundColor` on a covering `Box`, then centers its children in a
 * bordered content box. The backdrop uses `position: "absolute"` at
 * 100%×100% so it floats above the rest of the layout without displacing it.
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
  const theme = useModalTheme();
  const { isOpen, isTopmost, close } = useModal(modalId);

  useInput(
    (_input, key) => {
      if (key.escape) close();
    },
    { isActive: isOpen && isTopmost && closeOnEsc && RAW_MODE_SUPPORTED },
  );

  if (!isOpen) return null;

  return (
    <ModalRender
      theme={theme}
      title={title}
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
  /** Width of the modal content box. Number = columns, string = percentage. */
  readonly width?: ModalSize;
  /** Height of the modal content box. Number = rows, string = percentage. */
  readonly height?: ModalSize;
  /** Content rendered inside the modal body. */
  readonly children: React.ReactNode;
  /** Debug render ref to attach to the root Box. */
  readonly debugRef?: React.Ref<import("ink").DOMElement>;
}

/**
 * Presentational form of `Modal` — backdrop + centered content box.
 *
 * The backdrop is a `position: "absolute"` Box sized 100%×100% with a dark
 * `backgroundColor`. Because Ink paints the background color into every cell
 * of the Box, the underlying content is visually dimmed/tinted without
 * needing to tile space characters. The content box is then centered on top
 * using flexbox alignment on the backdrop layer.
 */
export function ModalRender({
  theme,
  title,
  children,
}: ModalRenderProps): React.ReactElement {
  return (
    <Box
      {...theme.content}
      position="absolute"
    >
      {title !== undefined ? (
        <Text {...theme.title}>{title}</Text>
      ) : null}
      {children}
    </Box>
  );
}
