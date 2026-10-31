import { useCallback, useEffect, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { ChatPaneContext } from "../../hooks/useChatPane";
import { listPanes, useLayout } from "../../hooks/useLayout";
import type { DropZone, SplitDirection } from "../../hooks/useLayout";
import { ChatPaneRoutes } from "../../routes/routes";
import { DropZones } from "../DropZones";
import { ChatPaneHeader } from "./ChatPaneHeader";
import { paneTitle } from "./ChatPane.utils";
import styles from "./ChatPane.module.scss";

/** The pane to show. */
export interface ChatPaneProps {
  /** Identity of the pane in the layout. */
  readonly id: string;
}

/**
 * Show one pane of the workspace: its header, and the page its own router selects.
 * @param {ChatPaneProps} props - Component properties.
 * @returns {React.ReactElement} The pane.
 */
export function ChatPane({ id }: ChatPaneProps) {
  const {
    layout,
    paneCount,
    canSplit,
    maximizedId,
    draggingId,
    splitPane,
    closePane,
    movePane,
    activatePane,
    toggleMaximize,
    setDragging,
  } = useLayout();
  const path =
    listPanes(layout.root).find((pane) => pane.id === id)?.path ?? "/";
  // The pane's router starts at the saved route and is the source of truth afterward.
  const [initialPath] = useState(path);
  const maximized = maximizedId === id;
  const hasSiblings = paneCount > 1;

  const handleSplit = useCallback(
    (direction: SplitDirection) => splitPane(id, direction),
    [splitPane, id],
  );
  const handleClose = useCallback(() => closePane(id), [closePane, id]);
  const handleToggleMaximize = useCallback(
    () => toggleMaximize(id),
    [toggleMaximize, id],
  );
  const handleActivate = useCallback(
    () => activatePane(id),
    [activatePane, id],
  );
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = "move";
      // Browsers only start a drag that carries data.
      event.dataTransfer.setData("text/plain", id);
      setDragging(id);
    },
    [setDragging, id],
  );
  const handleDragEnd = useCallback(
    () => setDragging(undefined),
    [setDragging],
  );
  const handleDrop = useCallback(
    (zone: DropZone) => {
      if (draggingId !== undefined) movePane(draggingId, id, zone);
      setDragging(undefined);
    },
    [draggingId, movePane, setDragging, id],
  );

  return (
    <ChatPaneRender
      title={paneTitle(path)}
      active={layout.activeId === id}
      maximized={maximized}
      hasSiblings={hasSiblings}
      canSplit={canSplit}
      draggable={hasSiblings && !maximized}
      onSplit={handleSplit}
      onToggleMaximize={handleToggleMaximize}
      onClose={handleClose}
      onActivate={handleActivate}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      overlay={
        draggingId !== undefined && draggingId !== id ? (
          <DropZones onDrop={handleDrop} />
        ) : undefined
      }
    >
      <ChatPaneContext.Provider value={{ paneId: id }}>
        <MemoryRouter initialEntries={[initialPath]}>
          <LocationReporter paneId={id} />
          <ChatPaneRoutes />
        </MemoryRouter>
      </ChatPaneContext.Provider>
    </ChatPaneRender>
  );
}

/**
 * Tell the layout which route the pane's router is showing.
 * @param {{paneId: string}} props - Component properties.
 * @returns {null} Renders nothing.
 */
function LocationReporter({ paneId }: { readonly paneId: string }) {
  const { pathname } = useLocation();
  const { setPanePath } = useLayout();
  useEffect(
    () => setPanePath(paneId, pathname),
    [setPanePath, paneId, pathname],
  );
  return null;
}

/** Presentation state and handlers for a pane. */
export interface ChatPaneRenderProps {
  /** Name shown in the header. */
  readonly title: string;
  /** Whether the pane has focus. */
  readonly active: boolean;
  /** Whether the pane fills the workspace. */
  readonly maximized: boolean;
  /** Whether other panes exist. */
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
  /** Focus this pane. */
  readonly onActivate: () => void;
  /** Begin dragging the pane. */
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  /** Finish dragging the pane. */
  readonly onDragEnd: (event: DragEvent<HTMLElement>) => void;
  /** Drop targets shown while another pane is dragged over this one. */
  readonly overlay?: ReactNode;
  /** The page. */
  readonly children: ReactNode;
}

/**
 * Lay out the header, page, and drop overlay of a pane.
 * @param {ChatPaneRenderProps} props - Component properties.
 * @returns {React.ReactElement} The pane frame.
 */
export function ChatPaneRender({
  title,
  active,
  maximized,
  hasSiblings,
  canSplit,
  draggable,
  onSplit,
  onToggleMaximize,
  onClose,
  onActivate,
  onDragStart,
  onDragEnd,
  overlay,
  children,
}: ChatPaneRenderProps) {
  const [centered, setCentered] = useState(false);

  return (
    // A group, not a landmark: panes repeat and may share a title.
    <div
      role="group"
      className={styles.pane}
      aria-label={title}
      data-active={active && hasSiblings}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
    >
      <ChatPaneHeader
        title={title}
        centered={centered}
        onToggleWidth={() => setCentered((value) => !value)}
        maximized={maximized}
        hasSiblings={hasSiblings}
        canSplit={canSplit}
        draggable={draggable}
        onSplit={onSplit}
        onToggleMaximize={onToggleMaximize}
        onClose={onClose}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      <div className={styles.body} data-centered={centered}>
        {children}
      </div>
      {overlay}
    </div>
  );
}
