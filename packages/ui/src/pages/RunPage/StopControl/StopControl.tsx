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
  return (
    <StopControlRender
      active={stop.active}
      canStop={stop.canStop}
      isStopping={stop.isStopping}
      onStop={stop.stop}
    />
  );
}

/** Availability and action for the run's stop control. */
export interface StopControlRenderProps {
  /** Whether the run has active work and the control should be shown. */
  readonly active: boolean;
  /** Whether connection and run state allow stopping. */
  readonly canStop: boolean;
  /** A stop request is waiting for acknowledgement. */
  readonly isStopping: boolean;
  /** Request stopping the run. */
  readonly onStop: () => void;
}

/**
 * Render the stop action and scoped double-Escape hint without reading run state.
 * @param {StopControlRenderProps} props - Availability and stop action.
 * @returns {React.ReactElement | null} Stop control and its keyboard hint.
 */
export function StopControlRender({
  active,
  canStop,
  isStopping,
  onStop,
}: StopControlRenderProps) {
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
    enabled: canStop && focused,
    onTrigger: onStop,
    scopeRef: controlRef,
    isInScope,
  });
  const usable = canStop && !isStopping;
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
  if (!active) {
    return null;
  }
  return (
    <span className={styles.control} ref={setControl}>
      <IconButton
        className={styles.stop}
        label={isStopping ? "Stopping…" : "Stop"}
        title="Stop run (Escape twice)"
        data-cancel
        onClick={onStop}
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
