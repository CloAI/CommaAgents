import { Box, Text, useFocus, useFocusManager } from "ink";
import type React from "react";
import { useEffect, useState } from "react";

import { ScrollableList } from "../ScrollableList";
import { SearchInput } from "../SearchInput";

import { BUILT_IN_COMMANDS } from "./CommandPalette.constants";
import { useCommandPaletteTheme } from "./CommandPalette.theme";
import type { Command, CommandPaletteProps } from "./CommandPalette.types";
import { filterCommands } from "./CommandPalette.utils";
import { HelpPage } from "./pages/HelpPage";
import { ListProvidersPage } from "./pages/ListProvidersPage";
import { SessionPickerPage } from "./pages/SessionPickerPage";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/** Map command id → page component for page-type commands. */
const PAGE_REGISTRY: ReadonlyMap<string, React.ComponentType<{ focusId: string }>> = new Map([
  ["help", HelpPage],
  ["list-providers", ListProvidersPage],
  ["session-picker", SessionPickerPage],
]);

/**
 * Command palette modal content.
 *
 * Manages a single focus zone for the entire palette — no child component
 * registers a competing zone. Arrow keys navigate the list; typing routes
 * into the search query; Enter selects; Esc goes back (or calls `onClose`
 * from the home view).
 *
 * The palette is rendered *inside* a `<Modal>` which provides the backdrop
 * and Esc-to-close behaviour. `CommandPalette` drives its own navigation
 * stack (home → sub-page) on top of that.
 *
 * @example
 * ```tsx
 * <Modal modalId="command-palette" title="Command Palette" width="60%">
 *   <CommandPalette
 *     isVisible={isOpen}
 *     id="command-palette"
 *     onClose={close}
 *     onExitApp={() => process.exit(0)}
 *   />
 * </Modal>
 * ```
 */
export function CommandPalette({
    isVisible,
    id = "command-palette",
    onClose,
    onExitApp,
    commands = BUILT_IN_COMMANDS,
  }: CommandPaletteProps): React.ReactElement | null {
  // const debug = useDebugRender("CommandPalette", { props: { isVisible, id } });
  const [commandListFilter, setCommandListFilter] = useState("");
  // TOOD: This is dumb use of utils, do better
  const filtered = filterCommands(commands, commandListFilter);

  // Single focus zone for the entire palette (home view).
  useFocus({
    id,
    isActive: RAW_MODE_SUPPORTED && isVisible,
  });
  const { focus, activeId } = useFocusManager();

  useEffect(() => {
    if (activeId !== id) {
      // force lock the focus to the command pallet
      focus(id)
    }
  }, [activeId, id, focus])

  // Claim focus whenever the palette becomes visible or returns to home view.
  useEffect(() => {
    if (RAW_MODE_SUPPORTED && isVisible) {
      focus(id);
    }
  }, [focus, id, isVisible]);


  function activateCommand(cmd: Command): void {
    if (cmd.action !== undefined) {
      cmd.action({ closePalette: onClose, exitApp: onExitApp });
      return;
    }
    const page = PAGE_REGISTRY.get(cmd.id);
    if (page !== undefined) {
      setCommandListFilter("");
    }
  }

  if (!isVisible) return null;

  return (
    <CommandPaletteRender
      id={id}
      query={commandListFilter}
      onSearchInputChange={(value) => {
        setCommandListFilter(value);
      }}
      filtered={filtered}
      onCommandSelected={activateCommand}
    />
  );
}

export interface CommandPaletteRenderProps {
  readonly id: string;
  readonly query: string;
  readonly onSearchInputChange: (value: string) => void;
  readonly filtered: readonly Command[];
  readonly onCommandSelected: (cmd: Command) => void;
}

/** Presentational form of `CommandPalette`. */
export function CommandPaletteRender({
  id,
  query,
  onSearchInputChange,
  filtered,
  onCommandSelected,
}: CommandPaletteRenderProps): React.ReactElement {
  const theme = useCommandPaletteTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <Box {...theme.container}>
            <Box {...theme.searchWrapper}>
              <SearchInput id={id} value={query} onChange={onSearchInputChange} placeholder="Type a command..." prompt="› " />
            </Box>
            <ScrollableList
              id={id}
              items={filtered}
              getKey={(cmd) => cmd.id}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
              onSelected={onCommandSelected}
              emptyText="No commands match"
              renderItem={(cmd, isSelected) => (
                <Box {...(isSelected ? theme.itemSelected : theme.item)}>
                  <Text {...(isSelected ? theme.labelSelected : theme.label)}>
                    {cmd.label}
                  </Text>
                  <Text {...theme.separator}> — </Text>
                  <Text {...theme.description}>{cmd.description}</Text>
                </Box>
              )}
            />
    </Box>
  );
}
