import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import type {
  ChatSession,
  PersistedSessionMeta,
} from "../../../../hooks/useChat/useChat.types";
import { useChatSessions } from "../../../../hooks/useChat/useChatSessions";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useModal } from "../../../../hooks/useModal";
import { useTheme } from "../../../../theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";

/** Modal id shared with App.tsx — must stay in sync. */
const COMMAND_PALETTE_MODAL_ID = "command-palette";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

function sessionHaystack(s: ChatSession): string {
  return [s.label, s.strategyName ?? "", s.strategyPath ?? "", s.id].join(" ");
}

function persistedHaystack(s: PersistedSessionMeta): string {
  return [s.title, s.cwd, s.daemonSessionId].join(" ");
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatIsoDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SessionItem =
  | { readonly kind: "local"; readonly session: ChatSession }
  | { readonly kind: "persisted"; readonly meta: PersistedSessionMeta };

function itemHaystack(item: SessionItem): string {
  return item.kind === "local"
    ? sessionHaystack(item.session)
    : persistedHaystack(item.meta);
}

export function SessionPickerPage({
  focusId,
}: {
  readonly focusId: string;
}): React.ReactElement {
  const debug = useDebugRender("SessionPickerPage", {});
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    persistedSessions,
    fetchPersistedSessions,
    loadPersistedSession,
    isLoadingSession,
  } = useChatSessions();
  const { close } = useModal(COMMAND_PALETTE_MODAL_ID);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    fetchPersistedSessions(process.cwd());
  }, [fetchPersistedSessions]);

  const { isFocused } = useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  const localItems: readonly SessionItem[] = Array.from(sessions.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((session) => ({ kind: "local" as const, session }));

  const persistedItems: readonly SessionItem[] = persistedSessions
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((meta) => ({ kind: "persisted" as const, meta }));

  const allItems = [...localItems, ...persistedItems];
  const filtered = filterByQuery(allItems, query, itemHaystack);

  useInput(
    (input, key) => {
      if (input && isMouseEscape(input)) return;
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const item = filtered[selectedIndex];
        if (item !== undefined) {
          if (item.kind === "local") {
            setActiveSessionId(item.session.id);
          } else {
            loadPersistedSession(item.meta.daemonSessionId);
          }
          close();
        }
        return;
      }
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
    <Box ref={debug.ref} flexDirection="column" width="100%" flexGrow={1}>
      <Box flexShrink={0} marginBottom={1}>
        <SearchInputRender
          theme={searchTheme}
          value={query}
          placeholder="Search sessions..."
          prompt="› "
        />
      </Box>
      <ScrollableList
        items={filtered}
        getKey={(item) =>
          item.kind === "local"
            ? item.session.id
            : `p:${item.meta.daemonSessionId}`
        }
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        onSelected={(item) => {
          if (item.kind === "local") {
            setActiveSessionId(item.session.id);
          } else {
            loadPersistedSession(item.meta.daemonSessionId);
          }
          close();
        }}
        isFocused={false}
        emptyText={
          isLoadingSession ? "Loading sessions..." : "No sessions found"
        }
        renderItem={(item, isSelected) => {
          if (item.kind === "local") {
            const session = item.session;
            return (
              <Box
                flexDirection="row"
                paddingX={1}
                backgroundColor={isSelected ? tokens.colors.surface : undefined}
              >
                <Box flexGrow={1} overflow="hidden">
                  <Text
                    bold={isSelected}
                    color={
                      session.id === activeSessionId
                        ? tokens.colors.primary
                        : tokens.colors.secondary
                    }
                  >
                    {session.label}
                  </Text>
                </Box>
                <Box flexShrink={0} marginLeft={2}>
                  <Text color={tokens.colors.muted}>
                    {formatDate(session.updatedAt)}
                  </Text>
                </Box>
              </Box>
            );
          }
          const meta = item.meta;
          return (
            <Box
              flexDirection="row"
              paddingX={1}
              backgroundColor={isSelected ? tokens.colors.surface : undefined}
            >
              <Box flexGrow={1} overflow="hidden">
                <Text bold={isSelected} color={tokens.colors.secondary}>
                  {meta.title}
                </Text>
                <Text color={tokens.colors.muted}> (saved)</Text>
              </Box>
              <Box flexShrink={0} marginLeft={2}>
                <Text color={tokens.colors.muted}>
                  {meta.daemonSessionId.slice(0, 8)}
                </Text>
              </Box>
              <Box flexShrink={0} marginLeft={2}>
                <Text color={tokens.colors.muted}>
                  {formatIsoDate(meta.updatedAt)}
                </Text>
              </Box>
            </Box>
          );
        }}
      />
    </Box>
  );
}
