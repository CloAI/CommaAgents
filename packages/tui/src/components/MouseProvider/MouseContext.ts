import { createContext } from "react";
import type { MouseEvent } from "../../hooks/useMouse/useMouse.types";

/**
 * Function signature for a mouse-event listener registered with
 * {@link MouseContextValue.subscribe}.
 */
export type MouseListener = (event: MouseEvent) => void;

/**
 * Value provided by {@link MouseProvider} via React context.
 *
 * Consumers should not use this directly — prefer the purpose-built hooks
 * {@link useMouseHover} and {@link useMouseClick}.
 */
export interface MouseContextValue {
  /**
   * Subscribe to all parsed mouse events. The returned function unsubscribes
   * the listener; call it in a `useEffect` cleanup.
   *
   * @param listener - Called once for every {@link MouseEvent} received.
   * @returns Unsubscribe function.
   */
  subscribe: (listener: MouseListener) => () => void;

  /**
   * Register a hover consumer. The provider ref-counts these registrations
   * and enables SGR any-event tracking (`?1003h`) while the count is > 0,
   * then disables it again when the count drops back to zero.
   *
   * @returns Unregister function — call it in a `useEffect` cleanup.
   */
  registerHoverConsumer: () => () => void;
}

/**
 * React context for the global mouse event bus.
 * `null` when no {@link MouseProvider} is mounted — consumer hooks
 * should gracefully degrade (e.g. return a disabled state).
 */
export const MouseContext = createContext<MouseContextValue | null>(null);
