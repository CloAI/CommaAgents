import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router";
import { useChatRunLifecycle } from "../../../../hooks/useChat/useChatRunLifecycle";
import { useChatRuns } from "../../../../hooks/useChat/useChatRuns";
import { usePersistedRunList } from "../../../../hooks/useChat/usePersistedRunList";
import { useDebugRender } from "../../../../hooks/useDebugRender";
import { useModal } from "../../../../hooks/useModal";
import { useTheme } from "../../../../Theme";
import { isMouseEscape } from "../../../../utils/mouseEscape";
import { ScrollableList } from "../../../ScrollableList";
import { SearchInputRender, useSearchInputTheme } from "../../../SearchInput";
import { filterByQuery } from "../../../SearchInput/SearchInput.utils";
import {
  COMMAND_PALETTE_MODAL_ID,
  RAW_MODE_SUPPORTED,
} from "./RunPickerPage.constants";
import type { RunItem } from "./RunPickerPage.types";
import { formatDate, formatIsoDate, itemHaystack } from "./RunPickerPage.utils";

export interface RunPickerPageProps {
  /** ID used for focus management. */
  readonly focusId: string;
}

export function RunPickerPage({
  focusId,
}: RunPickerPageProps): React.ReactElement {
  const debug = useDebugRender("RunPickerPage", {});
  const tokens = useTheme();
  const searchTheme = useSearchInputTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const { chatRuns } = useChatRuns();
  const { startStrategy } = useChatRunLifecycle();
  const { persistedRuns, fetchPersistedRuns } = usePersistedRunList();
  const { close } = useModal(COMMAND_PALETTE_MODAL_ID);

  // 1. State
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 2. Custom hooks
  const { isFocused } = useFocus({ id: focusId, isActive: RAW_MODE_SUPPORTED });

  // 3. Memos
  const localItems: readonly RunItem[] = Array.from(chatRuns.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((chatRun) => ({ kind: "local" as const, chatRun }));

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
  const currentChatRunId =
    matchPath("/chat/:chatRunId/*", location.pathname)?.params.chatRunId ??
    null;

  // 4. Callbacks
  const selectRun = useCallback(
    (item: RunItem): void => {
      const chatRunId =
        item.kind === "local"
          ? item.chatRun.id
          : startStrategy(item.meta.strategyPath, undefined, item.meta.cwd);
      navigate(`/chat/${encodeURIComponent(chatRunId)}`);
      close();
    },
    [close, navigate, startStrategy],
  );

  // 5. Effects
  useEffect(() => {
    fetchPersistedRuns(process.cwd());
  }, [fetchPersistedRuns]);

  useInput(
    (input, key) => {
      if (input && isMouseEscape(input)) return;
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1));
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
        setQuery((q) => q + input);
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
          value={""}
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
