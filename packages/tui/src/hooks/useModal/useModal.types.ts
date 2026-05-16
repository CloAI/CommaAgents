import type React from "react";

/** Unique identifier for a registered modal. */
export type ModalId = string;

/** State of a single modal instance. */
export interface ModalEntry {
  /** Whether this modal is currently visible. */
  readonly isOpen: boolean;
  /** Arbitrary data passed when opening the modal. */
  readonly data: unknown;
}

/** Controls returned by the `useModal` consumer hook. */
export interface ModalControls {
  /** Whether this modal is currently visible. */
  readonly isOpen: boolean;
  /** Whether this modal is the topmost currently open modal. */
  readonly isTopmost: boolean;
  /** Arbitrary data passed via `open(data)`. */
  readonly data: unknown;
  /** Show the modal, optionally passing data to it. */
  readonly open: (data?: unknown) => void;
  /** Hide the modal and clear its data. */
  readonly close: () => void;
  /** Toggle visibility. */
  readonly toggle: (data?: unknown) => void;
}

/** Shape of the modal registry context value. */
export interface ModalContextType {
  /** Map of all registered modal states keyed by id. */
  readonly modals: ReadonlyMap<ModalId, ModalEntry>;
  /** Ordered stack of currently open modal ids; last element is topmost. */
  readonly openStack: readonly ModalId[];
  /** Open a modal by id, optionally passing data. */
  readonly open: (modalId: ModalId, data?: unknown) => void;
  /** Close a modal by id. */
  readonly close: (modalId: ModalId) => void;
  /** Toggle a modal by id. */
  readonly toggle: (modalId: ModalId, data?: unknown) => void;
  /** Check whether a modal is open. */
  readonly isOpen: (modalId: ModalId) => boolean;
  /** Check whether a modal is the topmost open modal. */
  readonly isTopmost: (modalId: ModalId) => boolean;
  /** Retrieve the data for a modal. */
  readonly getData: (modalId: ModalId) => unknown;
}

/** Props for the ModalContextProvider component. */
export interface ModalContextProviderProps {
  /** Child components that can consume the modal context. */
  readonly children: React.ReactNode;
}
