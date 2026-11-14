import type { ReactNode } from "react";

/** One choice in a {@link Select}. */
export interface SelectOption {
  /** Unique value reported on selection. */
  readonly value: string;
  /** Primary text shown in the list and, when selected, on the trigger. */
  readonly label: string;
  /** Secondary single-line text shown in the list. */
  readonly description?: string;
  /** Short badge shown beside the label in the list. */
  readonly tag?: string;
  /** Noninteractive content beside the option label, such as capability icons. */
  readonly suffix?: ReactNode;
  /** Heading and filter chip the option belongs to; ungrouped options appear last, under All only. */
  readonly group?: string;
  /** Extra searchable text that is not displayed. */
  readonly keywords?: string;
  /** Reason the option cannot be chosen; shown in the list. Disabled options can still be highlighted. */
  readonly disabled?: string;
}

/** Options, current value, and the unavailable-state wording for a select. */
export interface SelectProps {
  /** Accessible name of the control. */
  readonly label: string;
  /** Choices in display order. Grouped options are sorted by label within their group. */
  readonly options: readonly SelectOption[];
  /** Value of the selected option, if any. */
  readonly value: string | undefined;
  /** Receive the value of a chosen option. */
  readonly onChange: (value: string) => void;
  /** Trigger text shown when no option is selected or the control is disabled. */
  readonly placeholder: string;
  /** Prevent opening the list. @default false */
  readonly disabled?: boolean;
  /** Show a search field and group filter chips; focus moves into the search field on open. @default false */
  readonly searchable?: boolean;
  /** Placeholder of the search field. @default "Search..." */
  readonly searchPlaceholder?: string;
  /** Group headings and chips in display order; other groups follow alphabetically. @default [] */
  readonly groupOrder?: readonly string[];
  /** Trigger text to show instead of the selected option's label, such as a value not in the list. */
  readonly triggerLabel?: string;
  /** Text shown when search or a chip leaves nothing to list. @default "No results" */
  readonly emptyMessage?: string;
}

/** Consecutive visible options sharing one group. */
export interface SelectSection {
  /** Group heading, or undefined for ungrouped options. */
  readonly group: string | undefined;
  /** Options with their index in the visible list. */
  readonly items: readonly {
    readonly option: SelectOption;
    readonly index: number;
  }[];
}

/** A run of text that either matches a search term or does not. */
export interface HighlightSegment {
  /** Text of the run. */
  readonly text: string;
  /** Whether a search term matched this run. */
  readonly match: boolean;
}
