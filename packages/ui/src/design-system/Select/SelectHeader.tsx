import type {
  ChangeEventHandler,
  KeyboardEventHandler,
  RefObject,
} from "react";
import styles from "./Select.module.scss";

/** Search text, group chips, and the combobox state of the search field. */
export interface SelectHeaderProps {
  /** Accessible name of the whole select. */
  readonly label: string;
  /** Placeholder of the search field. */
  readonly searchPlaceholder: string;
  /** Current search text. */
  readonly query: string;
  /** Field that owns focus while the list is open. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
  /** ID of the listbox, when one is shown. */
  readonly listId: string | undefined;
  /** ID of the highlighted option, when one exists. */
  readonly activeId: string | undefined;
  /** Chip names after "All"; empty hides the chips. */
  readonly groups: readonly string[];
  /** Chips that still have matching options. */
  readonly enabledGroups: readonly string[];
  /** Selected chip, or undefined for All. */
  readonly group: string | undefined;
  /** Update the search text. */
  readonly onQueryChange: ChangeEventHandler<HTMLInputElement>;
  /** Handle navigation and selection keys. */
  readonly onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  /** Choose a chip, or undefined for All. */
  readonly onGroupChange: (group: string | undefined) => void;
}

/**
 * Render the search field and group filter chips.
 * Chips are not tab stops; arrow keys cycle them while the search field is empty.
 * @param {SelectHeaderProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function SelectHeader({
  label,
  searchPlaceholder,
  query,
  inputRef,
  listId,
  activeId,
  groups,
  enabledGroups,
  group,
  onQueryChange,
  onKeyDown,
  onGroupChange,
}: SelectHeaderProps) {
  const chips: (string | undefined)[] = [undefined, ...groups];
  return (
    <div className={styles.header}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={`${label} search`}
        aria-expanded={listId !== undefined}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={activeId}
        autoComplete="off"
        spellCheck={false}
        className={styles.search}
        placeholder={searchPlaceholder}
        value={query}
        onChange={onQueryChange}
        onKeyDown={onKeyDown}
      />
      {groups.length > 0 && (
        <div
          role="radiogroup"
          aria-label={`${label} source`}
          className={styles.chips}
        >
          {chips.map((chip) => (
            <button
              key={chip ?? "all"}
              type="button"
              role="radio"
              aria-checked={chip === group}
              tabIndex={-1}
              className={styles.chip}
              disabled={chip !== undefined && !enabledGroups.includes(chip)}
              // Keep focus in the search field.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onGroupChange(chip)}
            >
              {chip ?? "All"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
