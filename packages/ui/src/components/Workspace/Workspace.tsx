import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { useEffect } from "react";
import {
  containsPane,
  hashFromPath,
  listPanes,
  useLayout,
} from "../../hooks/useLayout";
import type { LayoutNode } from "../../hooks/useLayout";
import { ChatPane } from "../ChatPane";
import styles from "./Workspace.module.scss";

/** Smallest width of a pane in a row, in pixels. */
const MIN_PANE_WIDTH = 240;
/** Smallest height of a pane in a column, in pixels. */
const MIN_PANE_HEIGHT = 160;

/**
 * Show the grid of chat panes and keep the address bar on the focused pane's route.
 * @returns {React.ReactElement} The workspace.
 */
export function Workspace() {
  const { layout } = useLayout();
  const activePath =
    listPanes(layout.root).find((pane) => pane.id === layout.activeId)?.path ??
    "/";
  useEffect(() => {
    const hash = hashFromPath(activePath);
    // Replacing keeps the browser history free of every pane switch.
    if (window.location.hash !== hash)
      window.history.replaceState(null, "", hash);
  }, [activePath]);
  return (
    <div className={styles.workspace}>
      <WorkspaceNode node={layout.root} />
    </div>
  );
}

/**
 * Render a pane, or a resizable split of nodes.
 * @param {{node: LayoutNode}} props - Component properties.
 * @returns {React.ReactElement} The node's content.
 */
function WorkspaceNode({ node }: { readonly node: LayoutNode }) {
  const { maximizedId, setSplitSizes } = useLayout();
  if (node.type === "pane") return <ChatPane id={node.id} />;
  return (
    <div className={styles.fill}>
      <Allotment
        vertical={node.direction === "column"}
        defaultSizes={node.sizes ? [...node.sizes] : undefined}
        minSize={node.direction === "row" ? MIN_PANE_WIDTH : MIN_PANE_HEIGHT}
        onChange={(sizes) => setSplitSizes(node.id, sizes)}
      >
        {node.children.map((child) => (
          <Allotment.Pane
            key={child.id}
            // Hidden panes stay mounted, so their runs and drafts survive full screen.
            visible={
              maximizedId === undefined || containsPane(child, maximizedId)
            }
          >
            <WorkspaceNode node={child} />
          </Allotment.Pane>
        ))}
      </Allotment>
    </div>
  );
}
