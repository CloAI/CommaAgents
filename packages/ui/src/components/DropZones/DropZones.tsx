import { useCallback, useState } from "react";
import type { DragEvent } from "react";
import type { DropZone } from "../../hooks/useLayout";
import { zoneAt } from "./DropZones.utils";
import styles from "./DropZones.module.scss";

/** Reaction to a pane being dropped on this one. */
export interface DropZonesProps {
  /** Receive the part of the pane the drop landed on. */
  readonly onDrop: (zone: DropZone) => void;
}

/**
 * Cover a pane while another is dragged over it, previewing which edge the drop would dock to.
 * @param {DropZonesProps} props - Component properties.
 * @returns {React.ReactElement} The drop overlay.
 */
export function DropZones({ onDrop }: DropZonesProps) {
  const [zone, setZone] = useState<DropZone>();
  const locate = useCallback((event: DragEvent<HTMLDivElement>): DropZone => {
    const box = event.currentTarget.getBoundingClientRect();
    return zoneAt(
      event.clientX - box.left,
      event.clientY - box.top,
      box.width,
      box.height,
    );
  }, []);
  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setZone(locate(event));
    },
    [locate],
  );
  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setZone(undefined);
      onDrop(locate(event));
    },
    [locate, onDrop],
  );
  const handleDragLeave = useCallback(() => setZone(undefined), []);
  return (
    <div
      className={styles.overlay}
      data-testid="drop-zones"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {zone && <div className={styles.preview} data-zone={zone} />}
    </div>
  );
}
