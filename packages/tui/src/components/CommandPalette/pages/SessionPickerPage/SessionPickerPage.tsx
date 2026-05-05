import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useState } from "react";

import { useChatSessions } from "../../../../hooks/useChat/useChatSessions";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useModal } from "../../../../hooks/useModal";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { useTheme } from "../../../../theme";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";
import type { ChatSession } from "../../../../hooks/useChat/useChat.types";

/** Modal id shared with App.tsx — must stay in sync. */
const COMMAND_PALETTE_MODAL_ID = "command-palette";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

function sessionHaystack(s: ChatSession): string {
  return [s.label, s.strategyName ?? "", s.strategyPath ?? ""].join(" ");
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Command palette sub-page that lists all chat sessions.
 *
 * Owns a single focus zone (`focusId`). All keyboard input — typing into the
 * search bar, arrow-key navigation, and Enter to select — is handled in one
 * `useInput` block. `SearchInputRender` is used (no hooks) so no competing
 * focus zone is registered.
 */
export function SessionPickerPage({ focusId }: { readonly focusId: string }): React.ReactElement {
  const debug = useDebugRender("SessionPickerPage", {});
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();

  const { sessions, activeSessionId, setActiveSessionId } = useChatSessions();
  const { close } = useModal(COMMAND_PALETTE_MODAL_ID);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Single focus zone — no SearchInput competing for the same id.
  const { isFocused } = useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  const sessionList = Array.from(sessions.values()).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  const filtered = filterByQuery(sessionList, query, sessionHaystack);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const session = filtered[selectedIndex];
        if (session !== undefined) {
          setActiveSessionId(session.id);
          close();
        }
        return;
      }
      // Typing updates the search query.
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      if (input && !key.ctrl && !key.meta && !key.tab && !key.escape) {
        setQuery((q) => q + input);
        setSelectedIndex(0);
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box ref={debug.ref} flexDirection="column" width="100%" height="100%">
      <Box flexShrink={0} marginBottom={1}>
        <SearchInputRender
          theme={searchTheme}
          value={query}
          placeholder="Search sessions..."
          prompt="› "
        />
      </Box>
      <Box flexGrow={1} overflow="hidden">
        <ScrollableList
          items={filtered}
          getKey={(s) => s.id}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          onSelected={(s) => {
            setActiveSessionId(s.id);
            close();
          }}
          isFocused={false}
          emptyText="No sessions found"
          renderItem={(s, isSelected) => (
            <Box
              flexDirection="row"
              paddingX={1}
              backgroundColor={isSelected ? tokens.colors.surface : undefined}
            >
              <Box flexGrow={1} overflow="hidden">
                <Text
                  bold={isSelected}
                  color={s.id === activeSessionId ? tokens.colors.primary : tokens.colors.secondary}
                >
                  {s.label}
                </Text>
              </Box>
              <Box flexShrink={0} marginLeft={2}>
                <Text color={tokens.colors.muted}>{formatDate(s.updatedAt)}</Text>
              </Box>
            </Box>
          )}
        />
      </Box>
    </Box>
  );
}
