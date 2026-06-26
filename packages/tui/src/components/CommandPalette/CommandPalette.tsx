import { Box, Text, useFocus, useFocusManager, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

import { isMouseEscape } from "../../utils/mouseEscape";
import { ScrollableList } from "../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../SearchInput";

import { BUILT_IN_COMMANDS } from "./CommandPalette.constants";
import { useCommandPaletteTheme } from "./CommandPalette.theme";
import type { Command, PaletteSubPageComponent } from "./CommandPalette.types";
import { filterCommands } from "./CommandPalette.utils";
import {
  CommandPaletteContextProvider,
  useCommandPalette,
} from "./useCommandPalette";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/**
 * Command palette modal content.
 *
 * Owns a small navigation stack: the home view shows the searchable command
 * list; selecting a page-type command pushes a sub-page. Esc pops the
 * sub-page back to home, or closes the palette when already at home.
 *
 * The palette is rendered *inside* a `<Modal closeOnEsc=\{false\}>` so that
 * Esc is routed here rather than dismissing the modal directly — otherwise
 * one keystroke would close the whole palette regardless of view.
 *
 * @example
 * ```tsx
 * <Modal modalId="command-palette" title="Command Palette" closeOnEsc={false}>
 *   <CommandPalette
 *     isVisible={isOpen}
 *     onClose={close}
 *   />
 * </Modal>
 * ```
 */
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
  /**
   * Override the built-in command registry. Defaults to `BUILT_IN_COMMANDS`.
   */
  readonly commands?: readonly Command[];
  /** Command page to open immediately when the palette becomes visible. */
  readonly initialCommandId?: string;
}

export function CommandPalette({
  id = "command-palette",
  isVisible,
  onClose,
  commands = BUILT_IN_COMMANDS,
  initialCommandId,
}: CommandPaletteProps): React.ReactElement | null {
  return (
    <CommandPaletteContextProvider closePalette={onClose}>
      <CommandPaletteContent
        id={id}
        isVisible={isVisible}
        commands={commands}
        initialCommandId={initialCommandId}
      />
    </CommandPaletteContextProvider>
  );
}

interface CommandPaletteContentProps {
  /** Stable Ink focus ID for the palette home view. */
  readonly id: string;
  /** Whether the command palette is visible. */
  readonly isVisible: boolean;
  /** Commands available from the palette home view. */
  readonly commands: readonly Command[];
  /** Command page to activate when opened programmatically. */
  readonly initialCommandId?: string;
}

function CommandPaletteContent({
  id,
  isVisible,
  commands,
  initialCommandId,
}: CommandPaletteContentProps): React.ReactElement | null {
  const [commandListFilter, setCommandListFilter] = useState("");
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);
  const { closePalette } = useCommandPalette();
  const { focus, activeId } = useFocusManager();
  const subPageFocusId = `${id}:page`;
  const isHomeView = activeCommand === null;
  const filteredCommands = filterCommands(commands, commandListFilter);

  const { isFocused } = useFocus({
    id,
    isActive: isVisible && isHomeView && RAW_MODE_SUPPORTED,
  });

  useEffect(() => {
    if (!isVisible) return;
    const targetId = isHomeView ? id : subPageFocusId;
    if (activeId !== targetId) {
      focus(targetId);
    }
  }, [activeId, focus, id, isHomeView, isVisible, subPageFocusId]);

  useEffect(() => {
    if (!isVisible || !initialCommandId) return;
    const initialCommand = commands.find(
      (command) => command.id === initialCommandId,
    );
    if (initialCommand) {
      setCommandListFilter("");
      setActiveCommand(initialCommand);
    }
  }, [commands, initialCommandId, isVisible]);

  useEffect(() => {
    if (isVisible) return;
    setCommandListFilter("");
    setActiveCommand(null);
  }, [isVisible]);

  useInput(
    (input, key) => {
      if (key.escape) {
        if (activeCommand === null) closePalette();
        return;
      }

      if (activeCommand !== null) return;
      if (input && isMouseEscape(input)) return;

      if (key.backspace || key.delete) {
        setCommandListFilter((currentFilter) => currentFilter.slice(0, -1));
        return;
      }

      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        !key.tab &&
        !key.return &&
        !key.upArrow &&
        !key.downArrow &&
        !key.leftArrow &&
        !key.rightArrow
      ) {
        setCommandListFilter((currentFilter) => currentFilter + input);
      }
    },
    { isActive: isVisible && RAW_MODE_SUPPORTED },
  );

  const activateCommand = useCallback((command: Command): void => {
    setCommandListFilter("");
    setActiveCommand(command);
  }, []);

  const returnToCommandList = useCallback((): void => {
    setActiveCommand(null);
  }, []);

  if (!isVisible) return null;

  if (activeCommand !== null) {
    return (
      <CommandPalettePageRender
        title={activeCommand.label}
        focusId={subPageFocusId}
        Page={activeCommand.page}
        onBack={returnToCommandList}
      />
    );
  }

  return (
    <CommandPaletteRender
      query={commandListFilter}
      filtered={filteredCommands}
      onCommandSelected={activateCommand}
      isFocused={isFocused}
    />
  );
}

export interface CommandPaletteRenderProps {
  /** Current search query string. */
  readonly query: string;
  /** List of filtered commands to display. */
  readonly filtered: readonly Command[];
  /** Callback invoked when a command is selected. */
  readonly onCommandSelected: (command: Command) => void;
  /** Whether the palette home view owns keyboard focus. */
  readonly isFocused: boolean;
}

/** Presentational form of `CommandPalette` (home view). */
export function CommandPaletteRender({
  query,
  filtered,
  onCommandSelected,
  isFocused,
}: CommandPaletteRenderProps): React.ReactElement {
  const theme = useCommandPaletteTheme();
  const searchTheme = useSearchInputTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <Box {...theme.container}>
      <Box {...theme.searchWrapper}>
        <SearchInputRender
          theme={searchTheme}
          value={query}
          placeholder="Type a command..."
          prompt="› "
        />
      </Box>
      <ScrollableList
        items={filtered}
        getKey={(command) => command.id}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        onSelected={onCommandSelected}
        isFocused={isFocused}
        emptyText="No commands match"
        renderItem={(command, isSelected) => (
          <Box {...(isSelected ? theme.itemSelected : theme.item)}>
            <Text {...(isSelected ? theme.labelSelected : theme.label)}>
              {command.label}
            </Text>
            <Text {...theme.separator}> — </Text>
            <Text {...theme.description}>{command.description}</Text>
          </Box>
        )}
      />
    </Box>
  );
}

interface CommandPalettePageRenderProps {
  /** The title of the sub-page to display. */
  readonly title: string;
  /** Unique identifier for the sub-page focus zone. */
  readonly focusId: string;
  /** The page component to render. */
  readonly Page: PaletteSubPageComponent;
  /** Return to the command list. */
  readonly onBack: () => void;
}

/** Presentational wrapper for a palette sub-page. */
function CommandPalettePageRender({
  title,
  focusId,
  Page,
  onBack,
}: CommandPalettePageRenderProps): React.ReactElement {
  const theme = useCommandPaletteTheme();
  return (
    <Box {...theme.container}>
      <Box flexShrink={0} marginBottom={1}>
        <Text {...theme.labelSelected}>{title}</Text>
      </Box>
      <Page focusId={focusId} onBack={onBack} />
    </Box>
  );
}
