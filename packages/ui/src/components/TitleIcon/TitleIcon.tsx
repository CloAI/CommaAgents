import { useEffect, useState } from "react";
import framesData from "./frames.json";
import styles from "./TitleIcon.module.scss";

/**
 * Play the TUI's ASCII logo while respecting the system motion preference.
 * @returns {React.ReactElement} The rendered component.
 */
export function TitleIcon() {
  const [frameIndex, setFrameIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(preference.matches);
    preference.addEventListener("change", handleChange);
    return () => preference.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(
      () =>
        setFrameIndex((previous) => (previous + 1) % framesData.frames.length),
      1000 / 16,
    );
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return (
    <TitleIconRender
      frame={
        framesData.frames[reducedMotion ? 0 : frameIndex]?.join("\n") ?? ""
      }
    />
  );
}

/** Current frame for the ASCII logo. */
export interface TitleIconRenderProps {
  /** Whitespace-preserving ASCII frame. */
  readonly frame: string;
}

/**
 * Render a stable, accessible logo region.
 * @param {TitleIconRenderProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function TitleIconRender({ frame }: TitleIconRenderProps) {
  return (
    <div className={styles.logo} role="img" aria-label="Comma Agents logo">
      <pre className={styles.frame} aria-hidden="true">
        {frame}
      </pre>
    </div>
  );
}
