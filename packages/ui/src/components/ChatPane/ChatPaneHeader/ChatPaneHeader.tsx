import {
  Columns2,
  FoldHorizontal,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Rows2,
  UnfoldHorizontal,
  X,
} from "lucide-react";
import type { DragEventHandler } from "react";
import { IconButton } from "../../../design-system/IconButton";
import type { SplitDirection } from "../../../hooks/useLayout";
import { ChatColorPicker } from "./ChatColorPicker";
import styles from "./ChatPaneHeader.module.scss";

/** What the header shows and does. */
export interface ChatPaneHeaderProps {
  readonly onNewChat?: () => void;
  readonly onMarkDone?: () => void;
  /** A submission must settle before transferring this chat. */
  readonly transferPending?: boolean;
  /** Move this chat into a new window. */
  readonly onPopOut?: () => void;
  /** Hide the pop-out action when this window has only one chat. */
  readonly detached?: boolean;
  /** Selected hue or the default theme. */
  readonly hue?: number;
  /** Save the pane hue. */
  readonly onHueChange?: (hue: number | undefined) => void;
  /** Storage failure shown in the color picker. */
  readonly colorError?: string;
  /** Name of the pane. */
  readonly title: string;
  /** Whether the pane is active among multiple panes. @default false */
  readonly active?: boolean;
  /** Whether chat content uses a centered reading width. */
  readonly centered?: boolean;
  /** Switch between centered and full-width content. */
  readonly onToggleWidth?: () => void;
  /** Whether the pane fills the workspace. */
  readonly maximized: boolean;
  /** Whether other panes exist, which enables full screen and close. */
  readonly hasSiblings: boolean;
  /** Whether another pane fits. */
  readonly canSplit: boolean;
  /** Whether the header can start a drag. */
  readonly draggable: boolean;
  /** Add a pane beside or below this one. */
  readonly onSplit: (direction: SplitDirection) => void;
  /** Fill the workspace, or return to the grid. */
  readonly onToggleMaximize: () => void;
  /** Remove this pane. */
  readonly onClose: () => void;
  /** Begin dragging the pane. */
  readonly onDragStart: DragEventHandler<HTMLElement>;
  /** Finish dragging the pane. */
  readonly onDragEnd: DragEventHandler<HTMLElement>;
}

/**
 * Show the pane's name with its split, full screen, and close actions; dragging it moves the pane.
 * @param {ChatPaneHeaderProps} props - Component properties.
 * @returns {React.ReactElement} The pane header.
 */
export function ChatPaneHeader({
  onNewChat,
  onMarkDone,
  hue,
  onHueChange,
  colorError,
  title,
  active = false,
  centered = false,
  onToggleWidth,
  maximized,
  hasSiblings,
  canSplit,
  draggable,
  onSplit,
  onToggleMaximize,
  onClose,
  onDragStart,
  onDragEnd,
  onPopOut,
  detached = false,
  transferPending = false,
}: ChatPaneHeaderProps) {
  return (
    // A div, not <header>: a banner landmark would repeat in every pane.
    <div
      className={styles.chatPaneHeader}
      data-active={active}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.actions}>
        {onNewChat && (
          <details className={styles.chatMenu}>
            <summary aria-label="New chat menu">
              New chat <span aria-hidden="true">▾</span>
            </summary>
            <div role="menu">
              <button
                role="menuitem"
                disabled={transferPending}
                onClick={(event) => {
                  onNewChat();
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                New chat
              </button>
              <button
                role="menuitem"
                disabled={transferPending || !onMarkDone}
                onClick={(event) => {
                  onMarkDone?.();
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
              >
                Mark done and new chat
              </button>
            </div>
          </details>
        )}
        {onHueChange && (
          <ChatColorPicker
            hue={hue}
            onHueChange={onHueChange}
            error={colorError}
          />
        )}
        <IconButton
          label="Split vertical"
          title="Split vertical: new pane beside this one"
          disabled={!canSplit}
          onClick={() => onSplit("row")}
        >
          <Columns2 />
        </IconButton>
        <IconButton
          label="Split horizontal"
          title="Split horizontal: new pane below this one"
          disabled={!canSplit}
          onClick={() => onSplit("column")}
        >
          <Rows2 />
        </IconButton>
        <IconButton
          label={centered ? "Use full chat width" : "Center chat"}
          aria-pressed={centered}
          onClick={onToggleWidth}
        >
          {centered ? <UnfoldHorizontal /> : <FoldHorizontal />}
        </IconButton>
        {onPopOut
          ? (!detached || hasSiblings) && (
              <IconButton
                label="Move to new window"
                disabled={transferPending}
                onClick={onPopOut}
              >
                <PictureInPicture2 />
              </IconButton>
            )
          : hasSiblings && (
              <IconButton
                label={maximized ? "Restore" : "Full screen"}
                aria-pressed={maximized}
                onClick={onToggleMaximize}
              >
                {maximized ? <Minimize2 /> : <Maximize2 />}
              </IconButton>
            )}
        {hasSiblings && (
          <IconButton
            label="Close pane"
            disabled={transferPending}
            onClick={onClose}
          >
            <X />
          </IconButton>
        )}
      </div>
    </div>
  );
}
