import type { ReactNode } from "react";

/** One searchable choice in a multi-select. */
export interface MultiSelectOption<OptionValue extends string = string> {
  /** Unique, nonempty identifier reported on selection. */
  readonly value: OptionValue;
  /** Primary text displayed in the list and selected pill. */
  readonly label: string;
  /** Optional secondary text, also included in search. */
  readonly description?: string;
  /** Decorative icon displayed beside the option label and inside its selected pill. */
  readonly icon?: ReactNode;
}
