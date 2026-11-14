import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react-dom";
import { Archive, Ellipsis } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useState } from "react";
import { IconButton } from "../../../design-system/IconButton";
import styles from "./WorkspaceMenu.module.scss";

/** Options belonging to one workspace. */
export interface WorkspaceMenuProps {
  /** Workspace whose options are being opened. */
  readonly projectName: string;
  /** Open this workspace's searchable archive. */
  readonly onSearchArchive?: () => void;
}

/**
 * Show workspace options in a top-layer popout anchored to the ellipsis icon.
 * @param {WorkspaceMenuProps} props - Workspace label and archive action.
 * @returns {React.ReactElement} Icon trigger and its dismissible options menu.
 */
export function WorkspaceMenu({
  projectName,
  onSearchArchive,
}: WorkspaceMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, update } = useFloating({
    open,
    placement: "bottom-end",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  useLayoutEffect(() => {
    if (open) {
      void update();
      refs.floating.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus();
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
        label={`Workspace menu: ${projectName}`}
        popoverTarget={menuId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
      >
        <Ellipsis size={16} />
      </IconButton>
      <div
        id={menuId}
        ref={refs.setFloating}
        popover="auto"
        role="menu"
        aria-label={`${projectName} options`}
        className={styles.menu}
        style={floatingStyles}
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            refs.floating.current?.hidePopover();
            if (refs.reference.current instanceof HTMLElement) {
              refs.reference.current.querySelector("button")?.focus();
            }
          }
        }}
      >
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          disabled={!onSearchArchive}
          onClick={() => {
            refs.floating.current?.hidePopover();
            onSearchArchive?.();
          }}
        >
          <Archive size={16} aria-hidden="true" />
          Search archive
        </button>
      </div>
    </span>
  );
}
