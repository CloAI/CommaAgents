import { Box, Text, useFocus, useFocusManager, useInput, type DOMElement } from "ink";
import type React from "react";
import { useRef, type RefObject } from "react";
import { useMouseClick } from "../../hooks/useMouseClick";
import { useMouseHover } from "../../hooks/useMouseHover";
import { useButtonTheme } from "./Button.theme";
import type { ButtonProps, ButtonRenderProps, ButtonVariant } from "./Button.types";

/** Raw-mode availability — required for `useInput` and `useFocus`. */
const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

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
 * @example
 * ```tsx
 * <Button label="Confirm" variant="primary" onPress={() => submit()} />
 * <Button label="Delete" variant="danger"  onPress={() => remove()} />
 * <Button label="Cancel" variant="ghost"   onPress={() => close()} />
 * ```
 */
export function Button({
  label,
  variant = "primary",
  onPress,
  disabled = false,
  id,
  isFocused: externalFocused,
}: ButtonProps): React.ReactElement {
  const theme = useButtonTheme();
  const boxRef = useRef<DOMElement | null>(null) as RefObject<DOMElement | null>;

  // Focus management — skip own zone when parent supplies `isFocused`.
  const ownFocus = useFocus({
    id,
    isActive: RAW_MODE_SUPPORTED && externalFocused === undefined,
  });
  const isFocused = externalFocused ?? ownFocus.isFocused;

  const { focus } = useFocusManager();

  // Hover tracking via ?1003h mouse mode.
  const { isHovered } = useMouseHover({ ref: boxRef });

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
    { isActive: isFocused && RAW_MODE_SUPPORTED },
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

/**
 * Pure render function for the `Button` component.
 *
 * Accepts fully-resolved props — no theme fallback logic, no hooks.
 * Useful for isolated visual testing and Storybook stories.
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
    <Box ref={boxRef} flexDirection="row" paddingX={theme.paddingX}>
      {/*
        Left bracket — part of the visual border drawn with Text glyphs
        so we avoid Ink box borders (which add layout rows). The bracket
        is colored like the variant, inverse when active.
      */}
      <Text color={resolvedColor} inverse={isActive} dimColor={disabled}>
        {"["}
      </Text>

      <Text
        color={resolvedColor}
        bold={theme.labelBold && isFocused}
        inverse={isActive}
        dimColor={disabled}
      >
        {" "}
        {label}
        {" "}
      </Text>

      <Text color={resolvedColor} inverse={isActive} dimColor={disabled}>
        {"]"}
      </Text>
    </Box>
  );
}
