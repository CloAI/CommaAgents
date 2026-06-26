import type React from "react";

/** Unique identifier for a registered command. */
export type CommandId = string;

/**
 * Component rendered for a page-style command. Receives `focusId` so it can
 * register exactly one Ink focus zone and consume keyboard input from the
 * palette without competing with sibling components.
 */
export type PaletteSubPageComponent = React.ComponentType<{
  readonly focusId: string;
  readonly onBack: () => void;
}>;

/**
 * A single entry in the command registry.
 *
 * Selecting a command mounts its page inside the palette. Commands that
 * perform an immediate effect own that effect in their page component.
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
  readonly page: PaletteSubPageComponent;
}
