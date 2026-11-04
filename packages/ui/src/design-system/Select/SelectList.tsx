import { useEffect, useId, useMemo, useRef } from "react";
import type { SelectOption } from "./Select.types";
import styles from "./Select.module.scss";
import { highlightSegments, optionId, sectionOptions } from "./Select.utils";

/** Visible options, highlight state, and selection handlers. */
export interface SelectListProps {
  /** Select identifier prefix. */
  readonly baseId: string;
  /** Accessible name of the listbox. */
  readonly label: string;
  /** Options in display order. */
  readonly visible: readonly SelectOption[];
  /** Value of the selected option. */
  readonly selectedValue: string | undefined;
  /** Index of the highlighted option. */
  readonly activeIndex: number;
  /** Lowercase search terms to highlight in labels. */
  readonly terms: readonly string[];
  /** Text shown when nothing is visible. */
  readonly emptyMessage: string;
  /** Choose the option at an index. */
  readonly onChoose: (index: number) => void;
  /** Clear search and filter; omitted when the list cannot be filtered. */
  readonly onClear?: () => void;
}

/**
 * Render grouped options, or an empty state with a way to clear the filter.
 * @param {SelectListProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function SelectList({
  baseId,
  label,
  visible,
  selectedValue,
  activeIndex,
  terms,
  emptyMessage,
  onChoose,
  onClear,
}: SelectListProps) {
  const headingBase = useId();
  const sections = useMemo(() => sectionOptions(visible), [visible]);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, visible]);

  if (visible.length === 0) {
    return (
      <div className={styles.empty}>
        <span>{emptyMessage}</span>
        {onClear && (
          <button
            type="button"
            className={styles.clear}
            // Keep focus in the search field.
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
          >
            Clear search
          </button>
        )}
      </div>
    );
  }

  const renderOption = (
    { option, index }: { option: SelectOption; index: number },
    divider: boolean,
  ) => (
    <div
      key={option.value}
      ref={index === activeIndex ? activeRef : undefined}
      id={optionId(baseId, index)}
      role="option"
      aria-selected={option.value === selectedValue}
      aria-disabled={option.disabled === undefined ? undefined : true}
      data-active={index === activeIndex}
      data-divider={divider}
      className={styles.option}
      // Keep focus where it is so keyboard navigation continues after a click.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onChoose(index)}
    >
      <span className={styles.heading}>
        <span className={styles.label}>
          {highlightSegments(option.label, terms).map((segment, position) =>
            segment.match ? (
              <mark key={position} className={styles.match}>
                {segment.text}
              </mark>
            ) : (
              segment.text
            ),
          )}
        </span>
        {option.suffix}
        {option.tag && <span className={styles.tag}>{option.tag}</span>}
      </span>
      {option.description && (
        <span className={styles.description}>{option.description}</span>
      )}
      {option.disabled && (
        <span className={styles.reason}>{option.disabled}</span>
      )}
    </div>
  );

  return (
    <div
      id={`${baseId}-list`}
      role="listbox"
      aria-label={label}
      className={styles.list}
    >
      {sections.map((section, position) =>
        section.group === undefined ? (
          section.items.map((item, itemPosition) =>
            renderOption(item, position > 0 && itemPosition === 0),
          )
        ) : (
          <div
            key={section.group}
            role="group"
            aria-labelledby={`${headingBase}-${position}`}
          >
            <div id={`${headingBase}-${position}`} className={styles.groupName}>
              {section.group}
            </div>
            {section.items.map((item) => renderOption(item, false))}
          </div>
        ),
      )}
    </div>
  );
}
