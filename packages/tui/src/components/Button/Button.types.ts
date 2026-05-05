import type { DOMElement } from "ink";
import type React from "react";
import type { RefObject } from "react";
import type { ButtonTheme } from "./Button.theme";

/**
 * Visual style variant for the button.
 *
 * - `primary`   — high-emphasis action; uses the theme primary color.
 * - `secondary` — medium-emphasis; uses the secondary color.
 * - `danger`    — destructive action; uses the error color.
 * - `ghost`     — minimal; no border, text only.
 */
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps {
  /** Text label rendered inside the button. */
  readonly label: string;
  /**
   * Visual variant that controls border and text coloring.
   * @default "primary"
   */
  readonly variant?: ButtonVariant;
  /** Callback invoked when the button is activated (Enter key or left/right click). */
  readonly onPress: () => void;
  /**
   * When `true` the button is rendered as disabled: it does not respond to
   * clicks or key presses and is visually dimmed.
   * @default false
   */
  readonly disabled?: boolean;
  /**
   * Ink focus id. When supplied the button participates in Ink's global focus
   * cycle. When omitted the button manages its own internal focus zone.
   */
  readonly id?: string;
  /**
   * External focus override. Useful when the parent manages focus state
   * centrally (e.g. a toolbar of buttons). When provided the button's own
   * `useFocus` result is ignored.
   */
  readonly isFocused?: boolean;
}

export interface ButtonRenderProps {
  /** Resolved Button theme. */
  readonly theme: ButtonTheme;
  /** Text label rendered inside the button. */
  readonly label: string;
  /** Active visual variant. */
  readonly variant: ButtonVariant;
  /** Whether the button currently has keyboard focus. */
  readonly isFocused: boolean;
  /** Whether the mouse cursor is hovering over the button. */
  readonly isHovered: boolean;
  /** Whether the button is disabled. */
  readonly disabled: boolean;
  /** Ref attached to the root `<Box>` for AABB hit-testing. */
  readonly boxRef: RefObject<DOMElement | null>;
  /** Node rendered inside the box (supplied by the container). */
  readonly children?: React.ReactNode;
}
