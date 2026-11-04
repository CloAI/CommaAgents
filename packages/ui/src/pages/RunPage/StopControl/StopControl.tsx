import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { Square } from "lucide-react";
import { IconButton } from "../../../design-system/IconButton";
import { useRunStop } from "../../../hooks/runs";
import { ChatPaneContext } from "../../../hooks/useChatPane";
import { useDoublePress } from "../../../hooks/useDoublePress";
import { LayoutContext } from "../../../hooks/useLayout/useLayout.context";
import { isRunPageTarget } from "./StopControl.utils";
import styles from "./StopControl.module.scss";

/**
 * Stop the followed run by button or a double Escape, hinting after the first press without moving focus.
 * Shown only while the run has work to stop.
 * @returns {React.ReactElement | null} Stop button with its viewport-aware hint.
 */
export function StopControl() {
  const stop = useRunStop();
  const controlRef = useRef<HTMLSpanElement>(null);
  const pane = useContext(ChatPaneContext);
  const layout = useContext(LayoutContext);
  const focused = !pane || layout?.layout.activeId === pane.paneId;
  const isInScope = useCallback(
    (target: Element | null) =>
      isRunPageTarget(
        controlRef.current?.closest("[data-run-page]") ?? null,
        target,
        pane !== null,
      ),
    [pane],
  );
  const { armed } = useDoublePress({
    key: "Escape",
    enabled: stop.canStop && focused,
    onTrigger: stop.stop,
    scopeRef: controlRef,
    isInScope,
  });
  const usable = stop.canStop && !stop.isStopping;
  useEffect(() => {
    // A disabled composer drops focus to the body; take it once stopping becomes possible.
    const ownerDocument = controlRef.current?.ownerDocument;
    if (
      usable &&
      focused &&
      ownerDocument?.activeElement === ownerDocument?.body
    ) {
      controlRef.current?.querySelector("button")?.focus();
    }
  }, [usable, focused]);
  const hintId = useId();
  const open = armed && usable;
  const { refs, floatingStyles, update } = useFloating({
    open,
    placement: "top",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `${Math.max(0, Math.min(288, availableWidth))}px`;
        },
      }),
    ],
  });
  const { floating, setReference } = refs;
  const setControl = useCallback(
    (element: HTMLSpanElement | null) => {
      controlRef.current = element;
      setReference(element);
    },
    [setReference],
  );
  useLayoutEffect(() => {
    const hintElement = floating.current;
    if (!open || !hintElement) {
      return;
    }
    hintElement.showPopover();
    void update();
    return () => {
      if (hintElement.matches(":popover-open")) {
        hintElement.hidePopover();
      }
    };
  }, [open, floating, update]);
  if (!stop.active) {
    return null;
  }
  return (
    <span className={styles.control} ref={setControl}>
      <IconButton
        className={styles.stop}
        label={stop.isStopping ? "Stopping…" : "Stop"}
        title="Stop run (Escape twice)"
        data-cancel
        onClick={stop.stop}
        disabled={!usable}
        aria-describedby={open ? hintId : undefined}
      >
        <Square fill="currentColor" />
      </IconButton>
      {open && (
        <span
          ref={refs.setFloating}
          id={hintId}
          popover="manual"
          role="status"
          className={styles.hint}
          style={floatingStyles}
        >
          Press Escape again to stop this chat.
        </span>
      )}
    </span>
  );
}
