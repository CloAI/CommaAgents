import React, { createContext, useCallback, useMemo, useState } from "react";

import type { ModalContextType, ModalEntry, ModalId, ModalProviderProps } from "./useModal.types";

/** Default closed state for any unregistered modal. */
const CLOSED_ENTRY: ModalEntry = { isOpen: false, data: undefined };

export const ModalContext = createContext<ModalContextType | null>(null);

/**
 * Provides a shared modal registry so any descendant can open, close,
 * or query modals by id without prop-drilling.
 *
 * @param props - Provider props containing children.
 * @example
 * ```tsx
 * <ModalProvider>
 *   <App />
 * </ModalProvider>
 * ```
 */
export function ModalProvider(props: ModalProviderProps): React.ReactElement {
  const { children } = props;
  const [modals, setModals] = useState<Map<ModalId, ModalEntry>>(new Map());

  const open = useCallback((modalId: ModalId, data?: unknown): void => {
    setModals((previous) => {
      const next = new Map(previous);
      next.set(modalId, { isOpen: true, data });
      return next;
    });
  }, []);

  const close = useCallback((modalId: ModalId): void => {
    setModals((previous) => {
      const next = new Map(previous);
      next.set(modalId, { isOpen: false, data: undefined });
      return next;
    });
  }, []);

  const toggle = useCallback((modalId: ModalId, data?: unknown): void => {
    setModals((previous) => {
      const next = new Map(previous);
      const current = previous.get(modalId) ?? CLOSED_ENTRY;
      next.set(modalId, {
        isOpen: !current.isOpen,
        data: current.isOpen ? undefined : data,
      });
      return next;
    });
  }, []);

  const isOpen = useCallback(
    (modalId: ModalId): boolean => {
      return modals.get(modalId)?.isOpen ?? false;
    },
    [modals],
  );

  const getData = useCallback(
    (modalId: ModalId): unknown => {
      return modals.get(modalId)?.data;
    },
    [modals],
  );

  const contextValue = useMemo<ModalContextType>(
    () => ({ modals, open, close, toggle, isOpen, getData }),
    [modals, open, close, toggle, isOpen, getData],
  );

  return <ModalContext.Provider value={contextValue}>{children}</ModalContext.Provider>;
}
