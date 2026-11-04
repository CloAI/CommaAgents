import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Input } from "../Input";
import { IconButton } from "../IconButton";
import type { MultiSelectOption } from "./MultiSelect.types";
import { SearchHighlight } from "../SearchHighlight";
import styles from "./MultiSelect.module.scss";

/** Controlled searchable selection with removable pills inside the field. */
export interface MultiSelectProps<OptionValue extends string = string> {
  /** Accessible name of the search field. */
  readonly label: string;
  /** Plural name used for the list, selected group, and search messages. */
  readonly listLabel: string;
  /** Text shown when no options are selected; choosing it clears the selection. */
  readonly emptyLabel: string;
  /** Available choices in display order. Values must be unique and nonempty. */
  readonly options: readonly MultiSelectOption<OptionValue>[];
  /** Selected values in pill display order. */
  readonly value: readonly OptionValue[];
  /** Commit a selection, removal, or clear action. */
  readonly onChange: (value: readonly OptionValue[]) => void;
}

/**
 * Search and toggle multiple choices while keeping the list open for further selection.
 * @param {MultiSelectProps} props - Options, labels, and controlled selection.
 * @returns {React.ReactElement} A searchable multi-select with inline pills.
 */
export function MultiSelect<OptionValue extends string>({
  label,
  listLabel,
  emptyLabel,
  options,
  value,
  onChange,
}: MultiSelectProps<OptionValue>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const search = query.trim().toLowerCase();
  const noun = listLabel.toLowerCase();
  const matches = options.filter((option) =>
    `${option.label} ${option.value} ${option.description ?? ""}`
      .toLowerCase()
      .includes(search),
  );
  const visibleOptions: readonly MultiSelectOption<OptionValue | "">[] = [
    { value: "", label: emptyLabel },
    ...matches,
  ];
  const active = Math.min(activeIndex, visibleOptions.length - 1);

  useEffect(() => {
    if (open) {
      listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [active, open, query]);

  const choose = (id: OptionValue | ""): void => {
    onChange(
      id === ""
        ? []
        : value.includes(id)
          ? value.filter((selected) => selected !== id)
          : [...value, id],
    );
    setOpen(id !== "");
    setQuery("");
    setActiveIndex(0);
  };
  const show = (): void => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };
  return (
    <div
      className={styles.picker}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className={styles.selector}>
        {value.length > 0 && (
          <div
            role="group"
            aria-label={`Selected ${noun}`}
            className={styles.chips}
          >
            {value.map((id) => {
              const option = options.find((option) => option.value === id);
              const name = option?.label ?? id;
              return (
                <span key={id} className={styles.chip}>
                  {option?.icon}
                  {name}
                  <IconButton
                    label={`Remove ${name}`}
                    className={styles.remove}
                    onClick={() => {
                      onChange(value.filter((selected) => selected !== id));
                      inputRef.current?.focus();
                      setOpen(true);
                      setQuery("");
                    }}
                  >
                    <X />
                  </IconButton>
                </span>
              );
            })}
          </div>
        )}
        <Input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          className={styles.input}
          value={query}
          placeholder={
            open
              ? `Search ${noun}...`
              : value.length
                ? `Add ${noun}...`
                : emptyLabel
          }
          onFocus={show}
          onClick={() => {
            if (!open) {
              show();
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                show();
                return;
              }
              setActiveIndex(
                event.key === "ArrowDown"
                  ? Math.min(active + 1, visibleOptions.length - 1)
                  : Math.max(active - 1, 0),
              );
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (open) {
                choose(visibleOptions[active]!.value);
              } else {
                show();
              }
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              setQuery("");
            } else if (event.key === "Tab") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        <IconButton
          label={`${open ? "Hide" : "Show"} ${noun}`}
          className={styles.toggle}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery("");
            } else {
              inputRef.current?.focus();
              show();
            }
          }}
        >
          <ChevronDown />
        </IconButton>
      </div>
      {open && (
        <div className={styles.popup}>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={listLabel}
            aria-multiselectable="true"
            className={styles.options}
          >
            {visibleOptions.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={
                  option.value === ""
                    ? value.length === 0
                    : value.includes(option.value)
                }
                data-active={index === active}
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(option.value)}
              >
                <span className={styles.optionLabel}>
                  {option.icon}
                  <SearchHighlight text={option.label} query={query} />
                </span>
                {option.description && (
                  <small>
                    <SearchHighlight text={option.description} query={query} />
                  </small>
                )}
              </div>
            ))}
          </div>
          {matches.length === 0 && (
            <p className={styles.empty} role="status">
              No {noun} match.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
