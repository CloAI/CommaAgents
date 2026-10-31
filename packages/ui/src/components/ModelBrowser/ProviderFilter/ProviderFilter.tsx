import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { Input } from "../../../design-system/Input";
import { IconButton } from "../../../design-system/IconButton";
import type { DiscoveredProvider } from "../ModelBrowser.types";
import { SearchHighlight } from "../SearchHighlight";
import styles from "./ProviderFilter.module.scss";

/** Searchable provider selection for the model catalog. */
export interface ProviderFilterProps {
  /** Provider names and identifiers available to search. */
  readonly providers: readonly DiscoveredProvider[];
  /** Selected provider IDs; an empty list includes every provider. */
  readonly value: readonly string[];
  /** Commit a provider selection. */
  readonly onChange: (value: readonly string[]) => void;
}

/**
 * Search provider names and IDs with pointer and keyboard selection.
 * @param {ProviderFilterProps} props - Provider options and controlled selection.
 * @returns {React.ReactElement} A compact editable combobox.
 */
export function ProviderFilter({
  providers,
  value,
  onChange,
}: ProviderFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const search = query.trim().toLowerCase();
  const matches = providers.filter((provider) =>
    `${provider.name} ${provider.id}`.toLowerCase().includes(search),
  );
  const options = [{ id: "", name: "All providers" }, ...matches];
  const active = Math.min(activeIndex, options.length - 1);

  useEffect(() => {
    if (open)
      listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open, query]);

  const choose = (id: string): void => {
    onChange(
      id === ""
        ? []
        : value.includes(id)
          ? value.filter((selected) => selected !== id)
          : [...value, id],
    );
    setOpen(false);
    setQuery("");
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
      <Input
        ref={inputRef}
        role="combobox"
        aria-label="Filter by provider"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className={styles.input}
        value={query}
        placeholder={
          open
            ? "Search providers..."
            : value.length
              ? "Add provider..."
              : "All providers"
        }
        onFocus={show}
        onClick={() => {
          if (!open) show();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              show();
              return;
            }
            setActiveIndex(
              event.key === "ArrowDown"
                ? Math.min(active + 1, options.length - 1)
                : Math.max(active - 1, 0),
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (open) choose(options[active]!.id);
            else show();
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
        label={open ? "Hide providers" : "Show providers"}
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
      {value.length > 0 && (
        <div
          role="group"
          aria-label="Selected providers"
          className={styles.chips}
        >
          {value.map((id) => {
            const name =
              providers.find((provider) => provider.id === id)?.name ?? id;
            return (
              <span key={id} className={styles.chip}>
                {name}
                <IconButton
                  label={`Remove ${name}`}
                  className={styles.remove}
                  onClick={() => {
                    onChange(value.filter((selected) => selected !== id));
                    inputRef.current?.focus();
                    setOpen(false);
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
      {open && (
        <div className={styles.popup}>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Providers"
            aria-multiselectable="true"
            className={styles.options}
          >
            {options.map((option, index) => (
              <div
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-label={option.name}
                aria-selected={
                  option.id === ""
                    ? value.length === 0
                    : value.includes(option.id)
                }
                data-active={index === active}
                className={styles.option}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(option.id)}
              >
                <span>
                  <SearchHighlight text={option.name} query={query} />
                </span>
                {option.id && (
                  <small>
                    <SearchHighlight text={option.id} query={query} />
                  </small>
                )}
              </div>
            ))}
          </div>
          {matches.length === 0 && (
            <p className={styles.empty} role="status">
              No providers match.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
