import { useCallback, useContext, useMemo } from "react";

import { ModalContext } from "./useModal.context";
import type { ModalControls, ModalId } from "./useModal.types";

/**
 * Programmatic controls for a specific modal identified by its id.
 *
 * Reads from the nearest `<ModalContextProvider>`. When called outside any
 * provider — most notably inside the detached `measureLayout` tree — the
 * context falls back to an inert no-op API so components render
 * structurally without crashing. In the live app the provider always wins.
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
  const {
    open: openModal,
    close: closeModal,
    toggle: toggleModal,
    isOpen: getIsOpen,
    isTopmost: getIsTopmost,
    getData,
  } = useContext(ModalContext);

  const open = useCallback(
    (data?: unknown): void => {
      openModal(modalId, data);
    },
    [openModal, modalId],
  );

  const close = useCallback((): void => {
    closeModal(modalId);
  }, [closeModal, modalId]);

  const toggle = useCallback(
    (data?: unknown): void => {
      toggleModal(modalId, data);
    },
    [toggleModal, modalId],
  );

  const isOpen = getIsOpen(modalId);
  const isTopmost = getIsTopmost(modalId);
  const data = getData(modalId);

  return useMemo<ModalControls>(
    () => ({ isOpen, isTopmost, data, open, close, toggle }),
    [isOpen, isTopmost, data, open, close, toggle],
  );
}
