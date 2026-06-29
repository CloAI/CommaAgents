import {
  Box,
  type DOMElement,
  Text,
  useFocus,
  useFocusManager,
  useInput,
} from "ink";
import type React from "react";
import { type RefObject, useRef } from "react";
import { useMouseClick } from "../../hooks/useMouseClick";
import { useMouseHover } from "../../hooks/useMouseHover";
import { type ButtonTheme, useButtonTheme } from "./Button.theme";
import type { ButtonVariant } from "./Button.types";

export interface ButtonProps {
  /** Ink focus id. When supplied the button participates in Ink's global focus cycle. When omitted the button manages its own internal focus zone. */
  readonly id?: string;

  /** Text label rendered inside the button. */
  readonly label: string;
  /** Visual variant that controls border and text coloring. @default "primary" */
  readonly variant?: ButtonVariant;
  /** Callback invoked when the button is activated (Enter key or left/right click). */
  readonly onPress: () => void;
  /** When `true` the button is rendered as disabled: it does not respond to clicks or key presses and is visually dimmed. @default false */
  readonly disabled?: boolean;
}

/**
 * Interactive button with focus, hover, and click support.
 *
 * Responds to:
 * - **Enter** key when focused → triggers `onPress`.
 * - **Left click** (button 0) → focuses the button then triggers `onPress`.
 * - **Right click** (button 2) → triggers `onPress` without stealing focus.
 *
 * Visual states:
 * - `variant` controls the color scheme (`primary`, `secondary`, `danger`, `ghost`).
 * - Focus and hover both highlight the button using an `inverse` text style.
 * - `disabled` dims the button and suppresses all interactions.
 *
 * Must be rendered inside a `<Frame>` (which mounts `<MouseProvider>`) for
 * mouse events to work.
 *
 * @param props - The button properties including label, variant, and activation callback.
 * @example
 * ```tsx
 * <Button label="Confirm" variant="primary" onPress={() => submit()} />
 * <Button label="Delete" variant="danger"  onPress={() => remove()} />
 * <Button label="Cancel" variant="ghost"   onPress={() => close()} />
 * ```
 */
export function Button({
  id,
  label,
  variant = "primary",
  onPress,
  disabled = false,
}: ButtonProps): React.ReactElement {
  // 1. State
  const boxRef = useRef<DOMElement | null>(null);

  // 3. Custom hooks
  const theme = useButtonTheme();
  const { isFocused } = useFocus({ id });
  const { focus } = useFocusManager();
  const { isHovered } = useMouseHover({ ref: boxRef });

  // 4. Callbacks
  // (Mouse clicks and keyboard input are handled by custom hooks below)

  // Left click (button 0): focus then activate.
  useMouseClick({
    ref: boxRef,
    buttons: [0],
    onClick: () => {
      if (disabled) return;
      if (id !== undefined) focus(id);
      onPress();
    },
  });

  // Right click (button 2): activate without stealing focus.
  useMouseClick({
    ref: boxRef,
    buttons: [2],
    onClick: () => {
      if (disabled) return;
      onPress();
    },
  });

  // Keyboard activation.
  useInput(
    (_input, key) => {
      if (disabled) return;
      if (key.return) onPress();
    },
    { isActive: isFocused },
  );

  return (
    <ButtonRender
      theme={theme}
      label={label}
      variant={variant}
      isFocused={isFocused}
      isHovered={isHovered}
      disabled={disabled}
      boxRef={boxRef}
    />
  );
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

/**
 * Pure render function for the `Button` component.
 *
 * Accepts fully-resolved props — no theme fallback logic, no hooks.
 * Useful for isolated visual testing and Storybook stories.
 *
 * @param props - The resolved rendering properties for the button.
 */
export function ButtonRender({
  theme,
  label,
  variant,
  isFocused,
  isHovered,
  disabled,
  boxRef,
}: ButtonRenderProps): React.ReactElement {
  const variantColors = theme.variants[variant as ButtonVariant];
  const isActive = (isFocused || isHovered) && !disabled;

  const color = disabled ? theme.disabledColor : variantColors.color;
  const focusColor = disabled ? theme.disabledColor : variantColors.focusColor;
  const resolvedColor = isActive ? focusColor : color;

  return (
    <Box ref={boxRef} {...theme.buttonContainer}>
      <Text
        color={resolvedColor}
        bold={theme.labelBold && isFocused}
        inverse={isActive}
        dimColor={disabled}
      >
        {`[ ${label} ]`}
      </Text>
    </Box>
  );
}
