import { Box, Text } from "ink";
import { useEffect, useRef, useState } from "react";

import { useDebugRender } from "../../hooks/useDebugRender";
import framesData from "./icon-generator/frames.json";
import { useTitleIconTheme } from "./TitleIcon.theme";

/** Pre-loaded animation data from the generator. */
const {
  fps,
  frames,
  totalFrames,
  height: frameHeight,
  width: frameWidth,
} = framesData as {
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  ramp: string;
  frames: string[][];
};

export interface TitleIconProps {
  /** Whether the animation is playing. Defaults to `true`. */
  readonly playing?: boolean;
}

/** Target animation speed in frames per second. */
const TARGET_FPS = 15;

/**
 * Animated ASCII art title icon.
 *
 * Renders pre-baked ASCII frames from `frames.json` at 15fps.
 * Each frame is an array of strings (one per row).
 */
export function TitleIcon({ playing = true }: TitleIconProps) {
  const debug = useDebugRender("TitleIcon", { props: { playing } });
  const theme = useTitleIconTheme();
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const frameStep = Math.max(1, Math.round(fps / TARGET_FPS));

  useEffect(() => {
    if (!playing) {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const intervalMs = 1000 / TARGET_FPS;

    timerRef.current = setInterval(() => {
      setFrameIndex((prev) => (prev + frameStep) % totalFrames);
    }, intervalMs);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, frameStep]);

  const currentFrame = frames[frameIndex];
  if (!currentFrame) return null;

  return (
    <Box ref={debug.ref} {...theme.container} height={frameHeight} width={frameWidth}>
      {currentFrame.map((line, index) => {
        const key = `line-${String(index)}`;
        return (
          <Text key={key} {...theme.frameLine}>
            {line}
          </Text>
        );
      })}
    </Box>
  );
}
