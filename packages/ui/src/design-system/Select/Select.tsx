import { ChevronDown } from "lucide-react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
} from "@floating-ui/react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ChangeEventHandler,
  KeyboardEvent,
  KeyboardEventHandler,
  ReactNode,
  RefObject,
} from "react";
import styles from "./Select.module.scss";
import { SelectHeader } from "./SelectHeader";
import { SelectList } from "./SelectList";
import type { SelectProps } from "./Select.types";
import {
  filterOptions,
  groupNames,
  matchesTerms,
  optionId,
  parseTerms,
} from "./Select.utils";

/**
 * Own the open state, search, group filter, and keyboard navigation of a single-choice list.
 * Without `searchable`, focus stays on the trigger and the highlighted option is exposed through
 * `aria-activedescendant`. With it, focus moves into the search field while the list is open.
 * @param {SelectProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function Select({
  label,
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search...",
  groupOrder = [],
  triggerLabel,
  emptyMessage = "No results",
}: SelectProps) {
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpen = open && !disabled && options.length > 0;
  const searching = searchable && isOpen;
  const terms = useMemo(() => parseTerms(query), [query]);
  const visible = useMemo(
    () => filterOptions(options, query, group, groupOrder),
    [options, query, group, groupOrder],
  );
  const groups = useMemo(
    () => (searchable ? groupNames(options, groupOrder) : []),
    [searchable, options, groupOrder],
  );
  const enabledGroups = useMemo(
    () =>
      groups.filter((name) =>
        options.some(
          (option) => option.group === name && matchesTerms(option, terms),
        ),
      ),
    [groups, options, terms],
  );
  const lastIndex = visible.length - 1;
  const selectedLabel =
    triggerLabel ?? options.find((option) => option.value === value)?.label;

  const openList = useCallback(() => {
    const ordered = filterOptions(options, "", undefined, groupOrder);
    setQuery("");
    setGroup(undefined);
    setActiveIndex(
      Math.max(
        ordered.findIndex((option) => option.value === value),
        0,
      ),
    );
    setOpen(true);
  }, [options, groupOrder, value]);
  const handleToggle = useCallback(() => {
    if (isOpen) {
      setOpen(false);
    } else {
      openList();
    }
  }, [isOpen, openList]);
  const handleChoose = useCallback(
    (index: number) => {
      const option = visible[index];
      if (!option || option.disabled !== undefined) {
        return;
      }
      onChange(option.value);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [visible, onChange],
  );
  const handleGroupChange = useCallback((next: string | undefined) => {
    setGroup(next);
    setActiveIndex(0);
  }, []);
  const handleQueryChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      setQuery(event.target.value);
      setActiveIndex(0);
    },
    [],
  );
  const handleClear = useCallback(() => {
    setQuery("");
    setGroup(undefined);
    setActiveIndex(0);
    inputRef.current?.focus();
  }, []);
  const cycleGroup = useCallback(
    (step: 1 | -1) => {
      const chips: (string | undefined)[] = [undefined, ...groups];
      const usable = (chip: string | undefined) =>
        chip === undefined || enabledGroups.includes(chip);
      let position = chips.indexOf(group);
      for (let tries = 0; tries < chips.length; tries++) {
        position = (position + step + chips.length) % chips.length;
        if (usable(chips[position])) {
          handleGroupChange(chips[position]);
          return;
        }
      }
    },
    [groups, enabledGroups, group, handleGroupChange],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
          event.preventDefault();
          if (!isOpen) {
            openList();
          } else {
            setActiveIndex((index) =>
              event.key === "ArrowDown"
                ? Math.min(index + 1, Math.max(lastIndex, 0))
                : Math.max(index - 1, 0),
            );
          }
          break;
        case "Home":
        case "End":
          // In the search field these keys move the caret.
          if (!isOpen || searching) {
            break;
          }
          event.preventDefault();
          setActiveIndex(event.key === "Home" ? 0 : lastIndex);
          break;
        case "ArrowLeft":
        case "ArrowRight":
          if (!searching || query !== "" || groups.length === 0) {
            break;
          }
          event.preventDefault();
          cycleGroup(event.key === "ArrowRight" ? 1 : -1);
          break;
        case "Enter":
          event.preventDefault();
          if (isOpen) {
            handleChoose(activeIndex);
          } else {
            openList();
          }
          break;
        case " ":
          // Space types a space in the search field.
          if (searching) {
            break;
          }
          event.preventDefault();
          if (isOpen) {
            handleChoose(activeIndex);
          } else {
            openList();
          }
          break;
        case "Escape":
          if (!isOpen) {
            break;
          }
          // Keep an enclosing dialog open while only the list closes.
          event.preventDefault();
          event.stopPropagation();
          if (searching && query !== "") {
            setQuery("");
            setActiveIndex(0);
          } else {
            setOpen(false);
            triggerRef.current?.focus();
          }
          break;
        case "Tab":
          if (searching) {
            triggerRef.current?.focus();
          }
          setOpen(false);
          break;
      }
    },
    [
      isOpen,
      searching,
      query,
      groups,
      lastIndex,
      activeIndex,
      openList,
      handleChoose,
      cycleGroup,
    ],
  );
  // Browsers activate a button on Space keyup; keydown already handled the key.
  const handleKeyUp = useCallback<KeyboardEventHandler<HTMLButtonElement>>(
    (event) => {
      if (event.key === " ") {
        event.preventDefault();
      }
    },
    [],
  );

  useEffect(() => {
    if (searching) {
      inputRef.current?.focus();
    }
  }, [searching]);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  const list = (
    <SelectList
      baseId={baseId}
      label={label}
      visible={visible}
      selectedValue={value}
      activeIndex={activeIndex}
      terms={terms}
      emptyMessage={emptyMessage}
      onChoose={handleChoose}
      onClear={searchable ? handleClear : undefined}
    />
  );
  return (
    <SelectRender
      baseId={baseId}
      label={label}
      selectedLabel={selectedLabel}
      placeholder={placeholder}
      disabled={disabled}
      open={isOpen}
      searchable={searchable}
      activeId={visible.length > 0 ? optionId(baseId, activeIndex) : undefined}
      rootRef={rootRef}
      triggerRef={triggerRef}
      onToggle={handleToggle}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      {searchable ? (
        <>
          <SelectHeader
            label={label}
            searchPlaceholder={searchPlaceholder}
            query={query}
            inputRef={inputRef}
            listId={visible.length > 0 ? `${baseId}-list` : undefined}
            activeId={
              visible.length > 0 ? optionId(baseId, activeIndex) : undefined
            }
            groups={groups}
            enabledGroups={enabledGroups}
            group={group}
            onQueryChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            onGroupChange={handleGroupChange}
          />
          {list}
        </>
      ) : (
        list
      )}
    </SelectRender>
  );
}

/** Presentation state, event handlers, and the panel content for the select. */
export interface SelectRenderProps {
  /** Prefix for element identifiers. */
  readonly baseId: string;
  /** Accessible name of the control. */
  readonly label: string;
  /** Label of the selected option. */
  readonly selectedLabel: string | undefined;
  /** Trigger text when nothing is selected. */
  readonly placeholder: string;
  /** Whether opening is prevented. */
  readonly disabled: boolean;
  /** Whether the panel is shown. */
  readonly open: boolean;
  /** Whether the panel has its own search field that owns focus. */
  readonly searchable: boolean;
  /** ID of the highlighted option, exposed from the trigger when it keeps focus. */
  readonly activeId: string | undefined;
  /** Container used to detect outside pointer events. */
  readonly rootRef: RefObject<HTMLDivElement | null>;
  /** Trigger that keeps focus while a plain list is open. */
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** Open or close the panel. */
  readonly onToggle: () => void;
  /** Handle navigation and selection keys on the trigger. */
  readonly onKeyDown: KeyboardEventHandler<HTMLButtonElement>;
  /** Suppress native Space activation. */
  readonly onKeyUp: KeyboardEventHandler<HTMLButtonElement>;
  /** Search header and list shown while open. */
  readonly children: ReactNode;
}

/**
 * Render the trigger and a viewport-constrained panel that escapes ancestor clipping.
 * @param {SelectRenderProps} props - Component properties.
 * @returns {React.ReactElement} The rendered component.
 */
export function SelectRender({
  baseId,
  label,
  selectedLabel,
  placeholder,
  disabled,
  open,
  searchable,
  activeId,
  rootRef,
  triggerRef,
  onToggle,
  onKeyDown,
  onKeyUp,
  children,
}: SelectRenderProps) {
  const { refs, floatingStyles, update } = useFloating({
    open,
    placement: "bottom-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableWidth, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `min(var(--select-max-width, 24rem), ${Math.max(0, availableWidth)}px)`,
            maxHeight: `${Math.max(0, availableHeight)}px`,
          });
        },
      }),
    ],
  });
  const { setReference, setFloating, floating } = refs;
  const setTrigger = useCallback(
    (element: HTMLButtonElement | null) => {
      triggerRef.current = element;
      setReference(element);
    },
    [triggerRef, setReference],
  );
  useLayoutEffect(() => {
    const panel = floating.current;
    if (!open || !panel) {
      return;
    }
    // The native top layer escapes pane clipping while preserving DOM focus and event order.
    panel.showPopover();
    void update();
    return () => {
      if (panel.matches(":popover-open")) {
        panel.hidePopover();
      }
    };
  }, [open, floating, update]);
  const panelId = `${baseId}-panel`;
  const visibleText = disabled ? placeholder : (selectedLabel ?? placeholder);
  return (
    <div className={styles.select} ref={rootRef}>
      <button
        ref={setTrigger}
        type="button"
        role={searchable ? undefined : "combobox"}
        aria-label={searchable ? `${label}: ${visibleText}` : label}
        aria-haspopup={searchable ? "dialog" : "listbox"}
        aria-expanded={open}
        aria-controls={searchable ? panelId : `${baseId}-list`}
        aria-activedescendant={!searchable && open ? activeId : undefined}
        className={styles.trigger}
        disabled={disabled}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        <span className={styles.value}>{visibleText}</span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </button>
      {open && (
        <div
          ref={setFloating}
          popover="manual"
          id={panelId}
          role={searchable ? "dialog" : undefined}
          aria-label={searchable ? label : undefined}
          className={styles.panel}
          style={floatingStyles}
        >
          {children}
        </div>
      )}
    </div>
  );
}
