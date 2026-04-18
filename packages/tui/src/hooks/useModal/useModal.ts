import { useCallback, useContext, useMemo } from "react";

import { ModalContext } from "./useModal.context";
import type { ModalControls, ModalId } from "./useModal.types";

/**
 * Programmatic controls for a specific modal identified by its id.
 *
 * Must be used within a `<ModalProvider>`.
 *
 * @param modalId - Unique identifier for the modal to control.
 * @example
 * ```tsx
 * const confirmModal = useModal("confirm-delete");
 *
 * // Open with data
 * confirmModal.open({ itemId: 42 });
 *
 * // Close
 * confirmModal.close();
 * ```
 */
export function useModal(modalId: ModalId): ModalControls {
  const context = useContext(ModalContext);

  if (context === null) {
    throw new Error("useModal must be used within a ModalProvider");
  }

  const open = useCallback(
    (data?: unknown): void => {
      context.open(modalId, data);
    },
    [context, modalId],
  );

  const close = useCallback((): void => {
    context.close(modalId);
  }, [context, modalId]);

  const toggle = useCallback(
    (data?: unknown): void => {
      context.toggle(modalId, data);
    },
    [context, modalId],
  );

  const isOpen = context.isOpen(modalId);
  const data = context.getData(modalId);

  return useMemo<ModalControls>(
    () => ({ isOpen, data, open, close, toggle }),
    [isOpen, data, open, close, toggle],
  );
}
