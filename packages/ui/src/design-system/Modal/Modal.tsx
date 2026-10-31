import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "../IconButton";
import styles from "./Modal.module.scss";

/** Controlled modal with an accessible title and arbitrary dialog content. */
export interface ModalProps {
  /** Whether the dialog is open. */
  readonly open: boolean;
  /** Visible heading and accessible dialog name. */
  readonly title: string;
  /** Request dismissal after Escape, the close action, or a native close. */
  readonly onClose: () => void;
  /** Additional class applied to the dialog for presentation overrides. */
  readonly className?: string;
  /** Dialog content, including any application-specific footer actions. */
  readonly children: ReactNode;
}

/**
 * Render a modal dialog that blocks background interaction and restores focus on close.
 * Backdrop clicks do not dismiss the dialog.
 * @param {ModalProps} props - Controlled visibility, title, dismissal, and content.
 * @returns {React.ReactElement} The native modal dialog.
 * @example
 * <Modal open={isOpen} title="Settings" onClose={closeSettings}>Settings content</Modal>
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  className = "",
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.modal} ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClose={(event) => {
        event.stopPropagation();
        if (open && !dialogRef.current?.open) onClose();
      }}
    >
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X />
        </IconButton>
      </header>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
