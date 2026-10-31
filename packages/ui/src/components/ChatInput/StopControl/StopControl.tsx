import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";
import { useId, useLayoutEffect } from "react";
import { Square } from "lucide-react";
import { IconButton } from "../../../design-system/IconButton";
import styles from "./StopControl.module.scss";

/** Active-run stop button and its first-Escape confirmation hint. */
export interface StopControlProps {
  /** Stop the current run. */
  readonly onCancel: () => void;
  /** Whether the stop request is awaiting acknowledgement. */
  readonly cancelling: boolean;
  /** Whether stopping is currently unavailable. */
  readonly disabled: boolean;
  /** Show the hint while a second Escape would stop the run. */
  readonly hint: boolean;
  /** Appearance shared with the composer's Send button. */
  readonly className?: string;
}

/**
 * Anchor a noninteractive shortcut hint above Stop without moving keyboard focus.
 * @param {StopControlProps} props - Stop action, availability, and hint visibility.
 * @returns {React.ReactElement} Stop button with its viewport-aware hint.
 */
export function StopControl({
  onCancel,
  cancelling,
  disabled,
  hint,
  className,
}: StopControlProps) {
  const hintId = useId();
  const open = hint && !disabled && !cancelling;
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
  const { floating } = refs;
  useLayoutEffect(() => {
    const hintElement = floating.current;
    if (!open || !hintElement) return;
    hintElement.showPopover();
    void update();
    return () => {
      if (hintElement.matches(":popover-open")) hintElement.hidePopover();
    };
  }, [open, floating, update]);
  return (
    <span className={styles.control} ref={refs.setReference}>
      <IconButton
        className={className}
        label={cancelling ? "Stopping…" : "Stop"}
        title="Stop run (Escape twice)"
        data-cancel
        onClick={onCancel}
        disabled={disabled || cancelling}
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
