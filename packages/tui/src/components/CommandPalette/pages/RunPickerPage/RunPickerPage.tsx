import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router";
import { useChatRunLifecycle } from "../../../../hooks/useChat/useChatRunLifecycle";
import { useChatRuns } from "../../../../hooks/useChat/useChatRuns";
import { usePersistedRunList } from "../../../../hooks/useChat/usePersistedRunList";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useTheme } from "../../../../Theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";
import { useCommandPalette } from "../../useCommandPalette";
import { RAW_MODE_SUPPORTED } from "./RunPickerPage.constants";
import type { RunItem } from "./RunPickerPage.types";
import { formatDate, formatIsoDate, itemHaystack } from "./RunPickerPage.utils";

export interface RunPickerPageProps {
  /** ID used for focus management. */
  readonly focusId: string;
  /** Return to the command list. */
  readonly onBack: () => void;
}

export function RunPickerPage({
  focusId,
  onBack,
}: RunPickerPageProps): React.ReactElement {
  const debug = useDebugRender("RunPickerPage", {});
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const { chatRuns } = useChatRuns();
  const { loadPersistedRun } = useChatRunLifecycle();
  const { persistedRuns, fetchPersistedRuns } = usePersistedRunList();
  const { closePalette } = useCommandPalette();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { isFocused } = useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  const localItems: readonly RunItem[] = Array.from(chatRuns.values())
    .sort((firstRun, secondRun) => secondRun.updatedAt - firstRun.updatedAt)
    .map((chatRun) => ({ kind: "local" as const, chatRun }));

  const liveDaemonRunIds = new Set<string>();
  for (const chatRun of chatRuns.values()) {
    if (chatRun.daemonRunId !== null) {
      liveDaemonRunIds.add(chatRun.daemonRunId);
    }
  }

  const persistedItems: readonly RunItem[] = persistedRuns
    .slice()
    .filter((runOverview) => !liveDaemonRunIds.has(runOverview.runId))
    .sort((firstRun, secondRun) =>
      secondRun.startedAt.localeCompare(firstRun.startedAt),
    )
    .map((runOverview) => ({
      kind: "persisted" as const,
      meta: runOverview,
    }));

  const allItems = [...localItems, ...persistedItems];
  const filtered = filterByQuery(allItems, query, itemHaystack);
  const currentChatRunId =
    matchPath("/chat/:chatRunId/*", location.pathname)?.params.chatRunId ??
    null;

  const selectRun = useCallback(
    (runItem: RunItem): void => {
      const chatRunId =
        runItem.kind === "local"
          ? runItem.chatRun.id
          : loadPersistedRun(runItem.meta);
      navigate(`/chat/${encodeURIComponent(chatRunId)}`);
      closePalette();
    },
    [closePalette, loadPersistedRun, navigate],
  );

  useEffect(() => {
    fetchPersistedRuns(process.cwd());
  }, [fetchPersistedRuns]);

  useInput(
    (input, key) => {
      if (input && isMouseEscape(input)) return;
      if (key.escape) {
        onBack();
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((currentQuery) => currentQuery.slice(0, -1));
        setSelectedIndex(0);
        return;
      }
      if (
        input &&
        !key.ctrl &&
        !key.meta &&
        !key.tab &&
        !key.escape &&
        !key.return
      ) {
        setQuery((currentQuery) => currentQuery + input);
        setSelectedIndex(0);
      }
    },
    { isActive: isFocused },
  );

  return (
    <RunPickerPageRender
      debug={debug}
      tokens={tokens}
      searchTheme={searchTheme}
      query={query}
      items={filtered}
      selectedIndex={selectedIndex}
      setSelectedIndex={setSelectedIndex}
      onSelected={selectRun}
      isFocused={isFocused}
      currentChatRunId={currentChatRunId}
    />
  );
}

export interface RunPickerPageRenderProps {
  /** Render debug ref. */
  readonly debug: ReturnType<typeof useDebugRender>;
  /** Theme tokens. */
  readonly tokens: ReturnType<typeof useTheme>;
  /** Search input theme. */
  readonly searchTheme: ReturnType<typeof useSearchInputTheme>;
  /** Current run search query. */
  readonly query: string;
  /** Filtered list of runs. */
  readonly items: readonly RunItem[];
  /** Selected index in the main list. */
  readonly selectedIndex: number;
  /** Setter for the main list index. */
  readonly setSelectedIndex: (index: number) => void;
  /** Callback invoked when a run is selected. */
  readonly onSelected: (item: RunItem) => void;
  /** Whether the page is currently focused. */
  readonly isFocused: boolean;
  /** ID of the chat run identified by the current route. */
  readonly currentChatRunId: string | null;
}

export function RunPickerPageRender({
  debug,
  tokens,
  searchTheme,
  query,
  items,
  selectedIndex,
  setSelectedIndex,
  onSelected,
  isFocused,
  currentChatRunId,
}: RunPickerPageRenderProps): React.ReactElement {
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
        items={items}
        getKey={(item) =>
          item.kind === "local" ? item.chatRun.id : `p:${item.meta.runId}`
        }
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
        onSelected={onSelected}
        isFocused={isFocused}
        emptyText="No runs found"
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
                      chatRun.id === currentChatRunId
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
