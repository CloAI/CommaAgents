import { useInput, useStdout } from "ink";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { parseMouseEvents } from "../../hooks/useMouse/useMouse.utils";
import type { MouseListener } from "./MouseContext";
import { MouseContext } from "./MouseContext";

/** Whether stdin supports raw mode (false in piped / non-TTY contexts). */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

export interface MouseProviderProps {
  /** Content that will have access to mouse events via context. */
  readonly children: React.ReactNode;
}

/**
 * Provides a global mouse-event bus to the subtree.
 *
 * Mount this component once, high in the tree (e.g. inside `Frame`).
 * It:
 * - Subscribes a single `useInput` listener that parses all SGR mouse
 *   chunks and fans them out to registered listeners.
 * - Ref-counts hover consumers: the first call to `registerHoverConsumer`
 *   writes `\x1b[?1003h` (any-event motion tracking); the last cleanup
 *   writes `\x1b[?1003l` to restore the previous mode.
 *
 * Consumer hooks ({@link useMouseHover}, {@link useMouseClick}) use the
 * context provided here rather than subscribing to `useInput` individually.
 */
export function MouseProvider({
  children,
}: MouseProviderProps): React.ReactElement {
  const { stdout } = useStdout();

  // Stable set of listeners — mutated via ref so subscribe/unsubscribe
  // doesn't cause any re-renders.
  const listenersRef = useRef<Set<MouseListener>>(new Set());

  // Ref-count for hover consumers. When it crosses 0→1 we enable ?1003h;
  // when it crosses 1→0 we disable it.
  const hoverCountRef = useRef(0);

  const enableHover = useCallback(() => {
    const out = stdout ?? process.stdout;
    out.write("\x1b[?1003h");
  }, [stdout]);

  const disableHover = useCallback(() => {
    const out = stdout ?? process.stdout;
    out.write("\x1b[?1003l");
  }, [stdout]);

  // Single useInput subscription — parses every SGR mouse chunk and
  // dispatches to all registered listeners.
  useInput(
    (input) => {
      const events = parseMouseEvents(input);
      if (events.length === 0) return;
      const listeners = listenersRef.current;
      for (const event of events) {
        for (const listener of listeners) {
          listener(event);
        }
      }
    },
    { isActive: RAW_MODE_SUPPORTED },
  );

  const subscribe = useCallback((listener: MouseListener): (() => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const registerHoverConsumer = useCallback((): (() => void) => {
    hoverCountRef.current += 1;
    if (hoverCountRef.current === 1) {
      enableHover();
    }
    return () => {
      hoverCountRef.current -= 1;
      if (hoverCountRef.current === 0) {
        disableHover();
      }
    };
  }, [enableHover, disableHover]);

  // Safety: disable hover mode if the provider unmounts while consumers are
  // still registered (e.g. during hot-reload in dev mode).
  useEffect(() => {
    return () => {
      if (hoverCountRef.current > 0) {
        disableHover();
        hoverCountRef.current = 0;
      }
    };
  }, [disableHover]);

  const value = useMemo(
    () => ({ subscribe, registerHoverConsumer }),
    [subscribe, registerHoverConsumer],
  );

  return (
    <MouseContext.Provider value={value}>{children}</MouseContext.Provider>
  );
}
