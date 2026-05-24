import type React from "react";

/** Unique identifier for a registered command. */
export type CommandId = string;

/**
 * Context passed to an action command when it fires.
 * Provides handles for app-level effects.
 */
export interface CommandActionContext {
  /** Close the command palette modal. */
  readonly closePalette: () => void;
  /** Exit the whole TUI application. */
  readonly exitApp: () => void;
  /** Reset the chat and return to the intro screen. */
  readonly resetChat: () => void;
}

/** Callback fired when an action-style command is selected. */
export type CommandAction = (context: CommandActionContext) => void;

/**
 * Component rendered for a page-style command. Receives `focusId` so it can
 * register exactly one Ink focus zone and consume keyboard input from the
 * palette without competing with sibling components.
 */
export type PaletteSubPageComponent = React.ComponentType<{
  readonly focusId: string;
}>;

/**
 * A single entry in the command registry.
 *
 * Commands are one of two kinds:
 * - **Page commands** — selecting them pushes a sub-page component inside
 *   the palette. Supply `page` as a zero-prop React component.
 * - **Action commands** — selecting them fires `action` immediately (e.g.
 *   to close the palette or exit the app). Supply `action` as a callback.
 *
 * Exactly one of `page` or `action` must be set.
 */
export interface Command {
  /** Stable identifier; used as React key. */
  readonly id: CommandId;
  /** Short display label shown in the suggestion list. */
  readonly label: string;
  /** One-line description rendered next to the label. */
  readonly description: string;
  /** Extra search keywords that fuzzy-match user input (lower-cased). */
  readonly keywords?: readonly string[];
  /** Sub-page component mounted when this command is selected. */
  readonly page?: PaletteSubPageComponent;
  /** Callback invoked when this command is selected instead of navigating. */
  readonly action?: CommandAction;
}

/** Props for the `CommandPalette` component. */
export interface CommandPaletteProps {
  /**
   * Whether the palette is currently visible. When false the component
   * renders nothing and handles no input.
   */
  readonly isVisible: boolean;
  /**
   * Stable Ink focus ID. Required for `useFocusManager().focus(id)` and
   * mouse click-to-focus. The palette registers exactly one focus zone
   * under this ID — no child component registers a competing zone.
   */
  readonly id?: string;
  /** Called when the user dismisses the palette from the home view. */
  readonly onClose: () => void;
  /** Called by the built-in `exit` command to quit the application. */
  readonly onExitApp: () => void;
  /** Called by the built-in `new-run` command to reset chat and return to intro. */
  readonly onResetChat: () => void;
  /**
   * Override the built-in command registry. Defaults to `BUILT_IN_COMMANDS`.
   */
  readonly commands?: readonly Command[];
}
