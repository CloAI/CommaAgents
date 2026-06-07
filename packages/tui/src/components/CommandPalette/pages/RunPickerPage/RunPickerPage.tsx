import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import type {
  ChatRun,
  RunOverview,
} from "../../../../hooks/useChat/useChat.types";
import { useChatRuns } from "../../../../hooks/useChat/useChatRuns";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useModal } from "../../../../hooks/useModal";
import { useTheme } from "../../../../Theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";

/** Modal id shared with App.tsx — must stay in sync. */
const COMMAND_PALETTE_MODAL_ID = "command-palette";

const RAW_MODE_SUPPORTED = typeof process.stdin.setRawMode === "function";

function chatRunHaystack(s: ChatRun): string {
  return [s.label, s.strategyName ?? "", s.strategyPath ?? "", s.id].join(" ");
}

function persistedHaystack(s: RunOverview): string {
  return [s.strategyName, s.cwd, s.runId].join(" ");
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

type RunItem =
  | { readonly kind: "local"; readonly chatRun: ChatRun }
  | { readonly kind: "persisted"; readonly meta: RunOverview };

function itemHaystack(item: RunItem): string {
  return item.kind === "local"
    ? chatRunHaystack(item.chatRun)
    : persistedHaystack(item.meta);
}

interface RunAction {
  readonly id: "restart" | "cancel";
  readonly label: string;
  readonly description: string;
}

const RUN_ACTIONS: readonly RunAction[] = [
  {
    id: "restart",
    label: "Restart",
    description: "Start the strategy fresh from the beginning",
  },
  {
    id: "cancel",
    label: "Cancel",
    description: "Go back to the run picker list",
  },
];

export function RunPickerPage({
  focusId,
}: {
  readonly focusId: string;
}): React.ReactElement {
  const debug = useDebugRender("RunPickerPage", {});
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();

  const {
    chatRuns,
    activeChatRunId,
    setActiveChatRunId,
    persistedRuns,
    fetchPersistedRuns,
    loadPersistedRun,
    startStrategy,
    isLoadingRun,
  } = useChatRuns();
  const { close } = useModal(COMMAND_PALETTE_MODAL_ID);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [promptTarget, setPromptTarget] = useState<RunOverview | null>(null);
  const [promptIndex, setPromptIndex] = useState(0);

  useEffect(() => {
    fetchPersistedRuns(process.cwd());
  }, [fetchPersistedRuns]);

  const { isFocused } = useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  const localItems: readonly RunItem[] = Array.from(chatRuns.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chatRun) => ({ kind: "local" as const, chatRun }));

  // A run that is already bound to a live local ChatRun is shown once,
  // as the local entry — picking the persisted duplicate would create a
  // read-only copy and sever the live binding, hiding the prompt area
  // for runs waiting on user input.
  const liveDaemonRunIds = new Set<string>();
  for (const chatRun of chatRuns.values()) {
    if (chatRun.daemonRunId !== null) {
      liveDaemonRunIds.add(chatRun.daemonRunId);
    }
  }

  const persistedItems: readonly RunItem[] = persistedRuns
    .slice()
    .filter((meta) => !liveDaemonRunIds.has(meta.runId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
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
            setActiveChatRunId(item.chatRun.id);
            close();
          } else {
            if (
              item.meta.status === "cancelled" ||
              item.meta.status === "error"
            ) {
              setPromptTarget(item.meta);
              setPromptIndex(0);
            } else {
              loadPersistedRun(item.meta.runId);
              close();
            }
          }
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
    { isActive: isFocused && promptTarget === null },
  );

  // Escape handler to cancel and return to main runs list when submenu is active
  useInput(
    (_input, key) => {
      if (key.escape) {
        setPromptTarget(null);
      }
    },
    { isActive: isFocused && promptTarget !== null },
  );

  if (promptTarget !== null) {
    return (
      <Box ref={debug.ref} flexDirection="column" width="100%" flexGrow={1}>
        <Box flexShrink={0} marginBottom={1} paddingX={1}>
          <Text bold color={tokens.colors.primary}>
            Run "{promptTarget.strategyName}" is stopped / interrupted.
          </Text>
        </Box>
        <ScrollableList
          id={`${focusId}:submenu`}
          items={RUN_ACTIONS}
          getKey={(action) => action.id}
          selectedIndex={promptIndex}
          onSelectedIndexChange={setPromptIndex}
          onSelected={(action) => {
            if (action.id === "restart") {
              startStrategy(promptTarget.strategyPath);
            }
            setPromptTarget(null);
            if (action.id !== "cancel") {
              close();
            }
          }}
          isFocused={isFocused}
          renderItem={(action, isSelected) => (
            <Box
              {...(isSelected ? searchTheme.itemSelected : searchTheme.item)}
            >
              <Text
                bold={isSelected}
                color={isSelected ? tokens.colors.primary : undefined}
              >
                {isSelected ? "› " : "  "}
                {action.label}
              </Text>
              <Text color={tokens.colors.muted}> — {action.description}</Text>
            </Box>
          )}
        />
      </Box>
    );
  }

  return (
    <Box ref={debug.ref} flexDirection="column" width="100%" flexGrow={1}>
      <Box flexShrink={0} marginBottom={1}>
        <SearchInputRender
          theme={searchTheme}
          value={query}
          placeholder="Search runs..."
          prompt="› "
        />
      </Box>
      <ScrollableList
        items={filtered}
        getKey={(item) =>
          item.kind === "local" ? item.chatRun.id : `p:${item.meta.runId}`
        }
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        onSelected={(item) => {
          if (item.kind === "local") {
            setActiveChatRunId(item.chatRun.id);
            close();
          } else {
            if (
              item.meta.status === "cancelled" ||
              item.meta.status === "error"
            ) {
              setPromptTarget(item.meta);
              setPromptIndex(0);
            } else {
              loadPersistedRun(item.meta.runId);
              close();
            }
          }
        }}
        isFocused={isFocused && promptTarget === null}
        emptyText={isLoadingRun ? "Loading runs..." : "No runs found"}
        renderItem={(item, isSelected) => {
          if (item.kind === "local") {
            const chatRun = item.chatRun;
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
                      chatRun.id === activeChatRunId
                        ? tokens.colors.primary
                        : tokens.colors.secondary
                    }
                  >
                    {chatRun.label}
                  </Text>
                </Box>
                <Box flexShrink={0} marginLeft={2}>
                  <Text color={tokens.colors.muted}>
                    {formatDate(chatRun.updatedAt)}
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
                  {meta.strategyName}
                </Text>
                <Text color={tokens.colors.muted}>
                  {" "}
                  ({meta.runId.slice(0, 8)})
                </Text>
              </Box>
              <Box flexShrink={0} marginLeft={2}>
                <Text color={tokens.colors.muted}>
                  {meta.status === "completed"
                    ? " completed"
                    : ` ${meta.status}`}
                </Text>
              </Box>
              <Box flexShrink={0} marginLeft={2}>
                <Text color={tokens.colors.muted}>
                  {formatIsoDate(meta.startedAt)}
                </Text>
              </Box>
            </Box>
          );
        }}
      />
    </Box>
  );
}
