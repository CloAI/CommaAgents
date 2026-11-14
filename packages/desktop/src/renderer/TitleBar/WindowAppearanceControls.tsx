import { Blend, CircleAlert, Pin, PinOff } from "lucide-react";
import { Slider } from "@comma-agents/ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MIN_WINDOW_OPACITY } from "../../shared/ipc";
import type { WindowAppearance } from "../../shared/ipc";
import styles from "./WindowAppearanceControls.module.scss";

/**
 * Control the native pin and opacity settings of this window.
 * @returns {React.ReactElement} The window appearance controls.
 */
export function WindowAppearanceControls() {
  const [appearance, setAppearance] = useState<WindowAppearance>({
    alwaysOnTop: false,
    opacity: 1,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const confirmedAppearance = useRef(appearance);
  const latestRequest = useRef(0);

  const handleChange = useCallback((patch: Partial<WindowAppearance>) => {
    const request = ++latestRequest.current;
    setAppearance((previous) => ({ ...previous, ...patch }));
    setError("");
    void window.commaDesktop.windowControls.setAppearance(patch).then(
      (updated) => {
        if (request === latestRequest.current) {
          confirmedAppearance.current = updated;
          setAppearance(updated);
        }
      },
      () => {
        if (request === latestRequest.current) {
          setAppearance(confirmedAppearance.current);
          setError("Unable to change window settings");
        }
      },
    );
  }, []);

  useEffect(() => {
    let current = true;
    void window.commaDesktop.windowControls.getAppearance().then(
      (initial) => {
        if (current) {
          confirmedAppearance.current = initial;
          setAppearance(initial);
          setReady(true);
        }
      },
      () => {
        if (current) {
          setError("Unable to read window settings");
        }
      },
    );
    return () => {
      current = false;
    };
  }, []);

  return (
    <WindowAppearanceControlsRender
      alwaysOnTop={appearance.alwaysOnTop}
      opacity={appearance.opacity}
      ready={ready}
      error={error}
      onChange={handleChange}
    />
  );
}

/** Inputs and native state for the title bar's appearance controls. */
export interface WindowAppearanceControlsRenderProps {
  /** Whether the window stays above other windows. */
  readonly alwaysOnTop: boolean;
  /** Current whole-window opacity. */
  readonly opacity: number;
  /** Whether native settings have loaded. */
  readonly ready: boolean;
  /** Failure to display, if present. */
  readonly error: string;
  /** Apply a pin or opacity change. */
  readonly onChange: (patch: Partial<WindowAppearance>) => void;
}

/**
 * Render accessible pin and sliding opacity controls.
 * @param {WindowAppearanceControlsRenderProps} props - Native state and change handler.
 * @returns {React.ReactElement} Pin and opacity controls.
 */
export function WindowAppearanceControlsRender({
  alwaysOnTop,
  opacity,
  ready,
  error,
  onChange,
}: WindowAppearanceControlsRenderProps) {
  const [expanded, setExpanded] = useState(false);
  const sliderId = useId();
  const opacityButton = useRef<HTMLButtonElement>(null);
  const percentage = Math.round(opacity * 100);
  const pinLabel = alwaysOnTop ? "Unpin window" : "Pin window on top";

  return (
    <div
      className={styles.controls}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.stopPropagation();
          setExpanded(false);
          opacityButton.current?.focus();
        }
      }}
    >
      {error && (
        <span role="alert" title={error} className={styles.error}>
          <CircleAlert size={14} aria-hidden="true" />
          <span className={styles.visuallyHidden}>{error}</span>
        </span>
      )}
      <button
        type="button"
        className={styles.button}
        aria-label={pinLabel}
        title={pinLabel}
        aria-pressed={alwaysOnTop}
        disabled={!ready}
        onClick={() => onChange({ alwaysOnTop: !alwaysOnTop })}
      >
        {alwaysOnTop ? (
          <PinOff size={14} aria-hidden="true" />
        ) : (
          <Pin size={14} aria-hidden="true" />
        )}
      </button>
      <div
        className={styles.sliderPanel}
        data-expanded={expanded}
        inert={!expanded}
        id={sliderId}
      >
        <div className={styles.sliderContent}>
          <Slider
            aria-label="Window opacity"
            aria-valuetext={`${percentage}%`}
            min={MIN_WINDOW_OPACITY * 100}
            max={100}
            step={1}
            value={percentage}
            disabled={!ready}
            onValueChange={(value) => onChange({ opacity: value / 100 })}
          />
          <output>{percentage}%</output>
        </div>
      </div>
      <button
        ref={opacityButton}
        type="button"
        className={styles.button}
        aria-label="Window opacity"
        title={`Window opacity: ${percentage}%`}
        aria-expanded={expanded}
        aria-controls={sliderId}
        disabled={!ready}
        onClick={() => setExpanded((previous) => !previous)}
      >
        <Blend size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
