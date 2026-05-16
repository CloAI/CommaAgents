import { Box, Text, useFocus, useFocusManager, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

import { ScrollableList } from "../ScrollableList";
import { SearchInput } from "../SearchInput";

import { BUILT_IN_COMMANDS } from "./CommandPalette.constants";
import { useCommandPaletteTheme } from "./CommandPalette.theme";
import type {
  Command,
  CommandPaletteProps,
  PaletteSubPageComponent,
} from "./CommandPalette.types";
import { filterCommands } from "./CommandPalette.utils";
import { HelpPage } from "./pages/HelpPage";
import { ListProvidersPage } from "./pages/ListProvidersPage";
import { SessionPickerPage } from "./pages/SessionPickerPage";
import { SettingsPage } from "./pages/SettingsPage";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

/** Map command id → page component for page-type commands. */
const PAGE_REGISTRY: ReadonlyMap<string, PaletteSubPageComponent> = new Map([
  ["help", HelpPage],
  ["list-providers", ListProvidersPage],
  ["session-picker", SessionPickerPage],
  ["settings", SettingsPage],
]);

/** Identifier for the active palette view — home (command list) or a sub-page. */
type PaletteView =
  | { readonly kind: "home" }
  | {
      readonly kind: "page";
      readonly commandId: string;
      readonly title: string;
    };

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
  const [commandListFilter, setCommandListFilter] = useState("");
  const [view, setView] = useState<PaletteView>({ kind: "home" });
  const filtered = filterCommands(commands, commandListFilter);

  const subPageFocusId = `${id}:page`;
  const homeFocusActive = isVisible && view.kind === "home";
  const subPageFocusActive = isVisible && view.kind === "page";

  // Two focus zones — one for the home view, one for sub-pages. Only the
  // active view's zone is registered, so input never leaks between layers.
  useFocus({ id, isActive: homeFocusActive });
  useFocus({ id: subPageFocusId, isActive: subPageFocusActive });
  const { focus, activeId } = useFocusManager();

  // Re-claim focus when the palette opens or the active view changes.
  useEffect(() => {
    if (!isVisible) return;
    const targetId = view.kind === "home" ? id : subPageFocusId;
    if (activeId !== targetId) {
      focus(targetId);
    }
  }, [activeId, focus, id, isVisible, subPageFocusId, view.kind]);

  const popPage = useCallback((): void => {
    setView({ kind: "home" });
  }, []);

  // Esc handling: pop sub-page if one is active, otherwise close the palette.
  useInput(
    (_input, key) => {
      if (!key.escape) return;
      if (view.kind === "page") {
        popPage();
        return;
      }
      onClose();
    },
    { isActive: isVisible && RAW_MODE_SUPPORTED },
  );

  const activateCommand = useCallback(
    (cmd: Command): void => {
      if (cmd.action !== undefined) {
        cmd.action({ closePalette: onClose, exitApp: onExitApp });
        return;
      }
      const pageComponent = PAGE_REGISTRY.get(cmd.id) ?? cmd.page;
      if (pageComponent !== undefined) {
        setCommandListFilter("");
        setView({ kind: "page", commandId: cmd.id, title: cmd.label });
      }
    },
    [onClose, onExitApp],
  );

  if (!isVisible) return null;

  if (view.kind === "page") {
    const PageComponent = PAGE_REGISTRY.get(view.commandId);
    return (
      <CommandPalettePageRender
        title={view.title}
        focusId={subPageFocusId}
        Page={PageComponent}
      />
    );
  }

  return (
    <CommandPaletteRender
      id={id}
      query={commandListFilter}
      onSearchInputChange={setCommandListFilter}
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

/** Presentational form of `CommandPalette` (home view). */
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
        <SearchInput
          id={id}
          value={query}
          onChange={onSearchInputChange}
          placeholder="Type a command..."
          prompt="› "
        />
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

interface CommandPalettePageRenderProps {
  readonly title: string;
  readonly focusId: string;
  readonly Page: PaletteSubPageComponent | undefined;
}

/** Presentational wrapper for a palette sub-page. */
function CommandPalettePageRender({
  title,
  focusId,
  Page,
}: CommandPalettePageRenderProps): React.ReactElement {
  const theme = useCommandPaletteTheme();
  return (
    <Box {...theme.container}>
      <Box flexShrink={0} marginBottom={1}>
        <Text {...theme.labelSelected}>{title}</Text>
      </Box>
      {Page !== undefined ? (
        <Page focusId={focusId} />
      ) : (
        <Text {...theme.empty}>Page not found</Text>
      )}
    </Box>
  );
}
