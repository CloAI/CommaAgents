import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";
import { Palette } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useState } from "react";
import { Button } from "../../../../design-system/Button";
import { IconButton } from "../../../../design-system/IconButton";
import styles from "./ChatColorPicker.module.scss";

/** Per-pane color controls in an anchored popout. */
export interface ChatColorPickerProps {
  /** Selected hue or the main theme. */
  readonly hue?: number;
  /** Save a hue, or restore the main theme. */
  readonly onHueChange: (hue: number | undefined) => void;
  /** Storage error to display beside the controls. */
  readonly error?: string;
}

/**
 * Open a compact color popout beside its palette button.
 * @param {ChatColorPickerProps} props - Color selection and persistence feedback.
 * @returns {React.ReactElement} The palette button and its popout.
 */
export function ChatColorPicker({
  hue,
  onHueChange,
  error,
}: ChatColorPickerProps) {
  const pickerId = useId();
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, update } = useFloating({
    open,
    placement: "bottom-end",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableWidth, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.max(0, availableWidth)}px`,
            maxHeight: `${Math.max(0, availableHeight)}px`,
          });
        },
      }),
    ],
  });
  useLayoutEffect(() => {
    if (open) {
      void update();
      refs.floating.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, [open, update, refs.floating]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOutside = (event: PointerEvent) => {
      const anchor = refs.reference.current;
      if (
        event.target instanceof Node &&
        !(anchor instanceof Element && anchor.contains(event.target)) &&
        !refs.floating.current?.contains(event.target)
      ) {
        refs.floating.current?.hidePopover();
      }
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () =>
      document.removeEventListener("pointerdown", closeOutside, true);
  }, [open, refs.reference, refs.floating]);
  return (
    <span ref={refs.setReference}>
      <IconButton
        label="Chat color"
        popoverTarget={pickerId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={pickerId}
      >
        <Palette />
      </IconButton>
      <div
        id={pickerId}
        ref={refs.setFloating}
        popover="auto"
        role="dialog"
        aria-label="Chat color"
        className={styles.colorPicker}
        style={floatingStyles}
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            refs.floating.current?.hidePopover();
          }
        }}
        onDragStart={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <label>
          Color hue
          <input
            aria-label="Chat color hue"
            type="range"
            min="0"
            max="360"
            value={hue ?? 258}
            onChange={(event) => onHueChange(Number(event.target.value))}
          />
        </label>
        <p>Keeps the main theme’s saturation and brightness.</p>
        {error && <p role="alert">{error}</p>}
        <Button onClick={() => onHueChange(undefined)}>Reset to theme</Button>
        <Button onClick={() => refs.floating.current?.hidePopover()}>
          Done
        </Button>
      </div>
    </span>
  );
}
