import type React from "react";
import { createContext, useCallback, useMemo, useState } from "react";

import type {
  ModalContextProviderProps,
  ModalContextType,
  ModalEntry,
  ModalId,
} from "./useModal.types";

/** Default closed state for any unregistered modal. */
const CLOSED_ENTRY: ModalEntry = { isOpen: false, data: undefined };

/**
 * Inert no-op modal API. Used as the default context value so components
 * rendered outside a live `<ModalContextProvider>` — most importantly
 * inside the detached tree Ink builds for `measureLayout` calls — still
 * render structurally without throwing. The functions don't manage real
 * state; all queries return "closed".
 */
const NULL_MODAL_CONTEXT: ModalContextType = {
  modals: new Map(),
  openStack: [],
  open: () => {},
  close: () => {},
  toggle: () => {},
  isOpen: () => false,
  isTopmost: () => false,
  getData: () => undefined,
};

export const ModalContext = createContext<ModalContextType>(NULL_MODAL_CONTEXT);

/**
 * Provides a shared modal registry so any descendant can open, close,
 * or query modals by id without prop-drilling.
 *
 * Tracks an ordered stack of open modals — the last id in the stack is the
 * topmost modal and is the only one that should receive input and respond
 * to Esc.
 *
 * @param props - Provider props containing children.
 * @example
 * ```tsx
 * <ModalContextProvider>
 *   <App />
 * </ModalContextProvider>
 * ```
 */
export function ModalContextProvider(
  props: ModalContextProviderProps,
): React.ReactElement {
  const { children } = props;
  const [modals, setModals] = useState<Map<ModalId, ModalEntry>>(new Map());
  const [openStack, setOpenStack] = useState<readonly ModalId[]>([]);

  const open = useCallback((modalId: ModalId, data?: unknown): void => {
    setModals((previous) => {
      const next = new Map(previous);
      next.set(modalId, { isOpen: true, data });
      return next;
    });
    setOpenStack((previous) => {
      // Move to top if already present, else push.
      const filtered = previous.filter((id) => id !== modalId);
      return [...filtered, modalId];
    });
  }, []);

  const close = useCallback((modalId: ModalId): void => {
    setModals((previous) => {
      const next = new Map(previous);
      next.set(modalId, { isOpen: false, data: undefined });
      return next;
    });
    setOpenStack((previous) => previous.filter((id) => id !== modalId));
  }, []);

  const toggle = useCallback((modalId: ModalId, data?: unknown): void => {
    setModals((previous) => {
      const current = previous.get(modalId) ?? CLOSED_ENTRY;
      const next = new Map(previous);
      next.set(modalId, {
        isOpen: !current.isOpen,
        data: current.isOpen ? undefined : data,
      });
      return next;
    });
    setOpenStack((previous) => {
      const isCurrentlyOpen = previous.includes(modalId);
      if (isCurrentlyOpen) return previous.filter((id) => id !== modalId);
      return [...previous, modalId];
    });
  }, []);

  const isOpen = useCallback(
    (modalId: ModalId): boolean => {
      return modals.get(modalId)?.isOpen ?? false;
    },
    [modals],
  );

  const isTopmost = useCallback(
    (modalId: ModalId): boolean => {
      return openStack[openStack.length - 1] === modalId;
    },
    [openStack],
  );

  const getData = useCallback(
    (modalId: ModalId): unknown => {
      return modals.get(modalId)?.data;
    },
    [modals],
  );

  const contextValue = useMemo<ModalContextType>(
    () => ({
      modals,
      openStack,
      open,
      close,
      toggle,
      isOpen,
      isTopmost,
      getData,
    }),
    [modals, openStack, open, close, toggle, isOpen, isTopmost, getData],
  );

  return (
    <ModalContext.Provider value={contextValue}>
      {children}
    </ModalContext.Provider>
  );
}
