import { Box, Text, useAnimation } from "ink";
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
const TARGET_FPS = 16;

/** Number of source frames to skip per rendered tick. */
const FRAME_STEP = Math.max(1, Math.round(fps / TARGET_FPS));

/**
 * Inner animated body. Lives inside the detached Ink instance owned by
 * `<DynamicContent>` so its 16fps re-renders never reach the outer tree.
 *
 * Split out as its own component because `useAnimation` must run in the
 * tree that will actually paint — i.e. the detached one — for the frame
 * advancement to drive only that tree's render cycle.
 */
function TitleIconBody({ playing }: { readonly playing: boolean }) {
  const theme = useTitleIconTheme();
  const { frame } = useAnimation({
    interval: 1000 / TARGET_FPS,
    isActive: playing,
  });

  const frameIndex = (frame * FRAME_STEP) % totalFrames;
  const currentFrame = frames[frameIndex];

  return (
    <Box {...theme.container}>
      <Box height={frameHeight} width={frameWidth} flexDirection="column">
        {currentFrame?.map((line, lineIndex) => (
          // Index-as-key is correct here: each row renders at a fixed line
          // position every tick — there's no reordering, just content swap.
          // biome-ignore lint/suspicious/noArrayIndexKey: stable per-row position
          <Text key={`frame-${lineIndex}`} {...theme.frameLine}>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/**
 * Animated ASCII art title icon.
 *
 * The animation runs inside a `<DynamicContent>` boundary so frame ticks
 * (16fps) repaint only a reserved region of the screen rather than the
 * whole app. This eliminates the flicker that the title would otherwise
 * induce in surrounding components on every tick.
 */
export function TitleIcon({ playing = true }: TitleIconProps) {
  return (
      <TitleIconBody playing={playing} />
  );
}
