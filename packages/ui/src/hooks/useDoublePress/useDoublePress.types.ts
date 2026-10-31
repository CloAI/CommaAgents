import type { RefObject } from "react";

/** The key to watch and what to do when it is pressed twice. */
export interface DoublePressOptions {
  /** `KeyboardEvent.key` that arms and triggers. */
  readonly key: string;
  /** Whether presses are currently watched. */
  readonly enabled: boolean;
  /** Called on the second press within the interval. */
  readonly onTrigger: () => void;
  /** Maximum gap between the two presses. @default 1500 */
  readonly intervalMs?: number;
  /** Element whose document receives the listeners. */
  readonly scopeRef: RefObject<HTMLElement | null>;
  /** Whether a press on this target belongs to the caller. @default every target */
  readonly isInScope?: (target: Element | null) => boolean;
}

/** Whether the first press has armed the trigger, so a hint can be shown. */
export interface DoublePress {
  readonly armed: boolean;
}

/** The parts of a keyboard event that decide whether it counts as a press. */
export type PressEvent = Pick<
  KeyboardEvent,
  | "key"
  | "defaultPrevented"
  | "isComposing"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "shiftKey"
>;
