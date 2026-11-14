import { createLayout, listPanes } from "../useLayout/layout";
import type {
  ClientWorkspaceStore,
  LayoutState,
  PaneCollection,
} from "../useLayout/useLayout.types";
import {
  parseLayout,
  serializeLayout,
} from "../useLayout/layout.serialization";
import type { WorkspaceChat } from "./useWorkspaces.types";

/**
 * Decode only validated layouts and collection records from local storage.
 * @returns {ClientWorkspaceStore} Saved workspace presentation with a General fallback.
 */
export function loadClientWorkspaces(): ClientWorkspaceStore {
  const general = {
    projectId: "general",
    state: { layout: createLayout(), strategyChoices: {} },
  };
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem("comma-agents.workspaces") ?? "null",
    );
    if (
      !saved ||
      typeof saved !== "object" ||
      !("workspaces" in saved) ||
      !saved.workspaces ||
      typeof saved.workspaces !== "object"
    ) {
      return { activeProjectId: "general", workspaces: { general } };
    }
    const workspaces: Record<
      string,
      { projectId: string; state: LayoutState }
    > = {};
    for (const [projectId, record] of Object.entries(saved.workspaces)) {
      if (
        !record ||
        typeof record !== "object" ||
        !("state" in record) ||
        !record.state ||
        typeof record.state !== "object" ||
        !("layout" in record.state)
      ) {
        continue;
      }
      const layout = parseLayout(
        serializeLayout(record.state.layout as LayoutState["layout"]),
      );
      if (!layout) {
        continue;
      }
      const raw = record.state as Partial<LayoutState>;
      const paneCollections: Record<string, PaneCollection> = {};
      for (const [paneId, collection] of Object.entries(
        raw.paneCollections ?? {},
      )) {
        if (
          collection &&
          Array.isArray(collection.chatIds) &&
          collection.chatIds.every((runId) => typeof runId === "string")
        ) {
          paneCollections[paneId] = {
            paneId,
            chatIds: collection.chatIds,
            closed: collection.closed === true,
            selectedChatId:
              typeof collection.selectedChatId === "string"
                ? collection.selectedChatId
                : undefined,
            ...(typeof collection.draftId === "string"
              ? { draftId: collection.draftId }
              : {}),
          };
        }
      }
      workspaces[projectId] = {
        projectId,
        state: {
          layout,
          paneCollections,
          strategyChoices: Object.fromEntries(
            Object.entries(raw.strategyChoices ?? {}).filter(
              ([, value]) => typeof value === "string",
            ),
          ),
        },
      };
    }
    return {
      activeProjectId:
        "activeProjectId" in saved &&
        typeof saved.activeProjectId === "string" &&
        workspaces[saved.activeProjectId]
          ? saved.activeProjectId
          : "general",
      workspaces: { general, ...workspaces },
    };
  } catch {
    return { activeProjectId: "general", workspaces: { general } };
  }
}

/**
 * Retain collection history for all visible panes, including pre-existing run routes.
 * @param {LayoutState} state - Current window layout and pane collections.
 * @returns {LayoutState} Layout with every displayed run registered in its pane.
 */
export function collectPaneChats(state: LayoutState): LayoutState {
  const paneCollections = { ...state.paneCollections };
  for (const pane of listPanes(state.layout.root)) {
    const runId = /^\/runs\/([^/]+)/.exec(pane.path)?.[1];
    const previous = paneCollections[pane.id];
    paneCollections[pane.id] = {
      ...(previous?.draftId ? { draftId: previous.draftId } : {}),
      paneId: pane.id,
      chatIds: [
        ...new Set([...(previous?.chatIds ?? []), ...(runId ? [runId] : [])]),
      ],
      selectedChatId: runId,
      closed: false,
    };
  }
  return { ...state, paneCollections };
}

/**
 * Copy selected memberships while preserving the source grid and strategy choices.
 * @param {LayoutState} state - Source pane arrangement and collections.
 * @param {Readonly<Record<string, string>>} runIdMap - Reviewed source to destination chat identities.
 * @returns {LayoutState} Arrangement containing only the selected chats.
 */
export function copyWorkspaceState(
  state: LayoutState,
  runIdMap: Readonly<Record<string, string>>,
): LayoutState {
  const paneCollections = Object.fromEntries(
    Object.entries(collectPaneChats(state).paneCollections ?? {}).map(
      ([paneId, collection]) => [
        paneId,
        {
          ...collection,
          chatIds: collection.chatIds.flatMap((runId) =>
            runIdMap[runId] ? [runIdMap[runId]!] : [],
          ),
          selectedChatId: collection.selectedChatId
            ? runIdMap[collection.selectedChatId]
            : undefined,
        },
      ],
    ),
  );
  const replaceNode = (
    node: LayoutState["layout"]["root"],
  ): LayoutState["layout"]["root"] =>
    node.type === "split"
      ? { ...node, children: node.children.map(replaceNode) }
      : {
          ...node,
          path: paneCollections[node.id]?.selectedChatId
            ? `/runs/${paneCollections[node.id]!.selectedChatId}`
            : "/",
        };
  return {
    layout: { ...state.layout, root: replaceNode(state.layout.root) },
    paneCollections,
    strategyChoices: state.strategyChoices,
  };
}

/**
 * Parse daemon ISO dates once before UI state owns the records.
 * @param {Parameters<typeof decodeChat>[0]} chat - Chat record received over the daemon protocol.
 * @returns {WorkspaceChat} Chat record containing native Date values.
 */
export function decodeChat(
  chat: Omit<WorkspaceChat, "lastActivityAt" | "archivedAt" | "doneAt"> & {
    readonly lastActivityAt: string;
    readonly archivedAt?: string;
    readonly doneAt?: string;
  },
): WorkspaceChat {
  return {
    ...chat,
    lastActivityAt: new Date(chat.lastActivityAt),
    archivedAt: chat.archivedAt ? new Date(chat.archivedAt) : undefined,
    doneAt: chat.doneAt ? new Date(chat.doneAt) : undefined,
  };
}

/**
 * Give a named workspace independent pane identities, preserving its arrangement.
 * @param {LayoutState} state - Presentation whose pane identities need independent ownership.
 * @param {Readonly<Record<string, string>>} existingIds - Mappings shared with the project detached windows.
 * @returns {{state: LayoutState, paneIdMap: Readonly<Record<string, string>>}} Remapped presentation and its complete identity map.
 */
export function remapWorkspacePanes(
  state: LayoutState,
  existingIds: Readonly<Record<string, string>> = {},
): {
  readonly state: LayoutState;
  readonly paneIdMap: Readonly<Record<string, string>>;
} {
  const paneIdMap = {
    ...existingIds,
    ...Object.fromEntries(
      [
        ...new Set([
          ...listPanes(state.layout.root).map((pane) => pane.id),
          ...Object.keys(state.paneCollections ?? {}),
        ]),
      ].map((paneId) => [paneId, existingIds[paneId] ?? crypto.randomUUID()]),
    ),
  };
  const remapNode = (
    node: LayoutState["layout"]["root"],
  ): LayoutState["layout"]["root"] =>
    node.type === "split"
      ? {
          ...node,
          id: crypto.randomUUID(),
          children: node.children.map(remapNode),
        }
      : { ...node, id: paneIdMap[node.id]! };
  return {
    paneIdMap,
    state: {
      layout: {
        root: remapNode(state.layout.root),
        activeId: paneIdMap[state.layout.activeId] ?? "",
      },
      strategyChoices: Object.fromEntries(
        Object.entries(state.strategyChoices).map(([paneId, choice]) => [
          paneIdMap[paneId] ?? paneId,
          choice,
        ]),
      ),
      paneCollections: Object.fromEntries(
        Object.entries(state.paneCollections ?? {}).map(
          ([paneId, collection]) => [
            paneIdMap[paneId]!,
            { ...collection, paneId: paneIdMap[paneId]! },
          ],
        ),
      ),
    },
  };
}

/**
 * Protect every displayed chat across saved projects and detached layouts during retention.
 * @param {ClientWorkspaceStore} store - Saved client project presentation.
 * @param {LayoutState} currentState - The current window state before persistence.
 * @returns {ReadonlySet<string>} Run identifiers protected from automatic archiving.
 */
export function displayedChatIds(
  store: ClientWorkspaceStore,
  currentState: LayoutState,
): ReadonlySet<string> {
  const displayed = new Set<string>();
  for (const state of [
    currentState,
    ...Object.values(store.workspaces).flatMap((record) => [
      record.state,
      ...(record.windowStates ?? []),
    ]),
  ]) {
    for (const pane of listPanes(state.layout.root)) {
      const runId = /^\/runs\/([^/]+)/.exec(pane.path)?.[1];
      if (runId) {
        displayed.add(runId);
      }
    }
  }
  return displayed;
}

/**
 * Select idle, unarchived chats older than the retention duration that no saved layout displays.
 * @param {readonly WorkspaceChat[]} chats - Current daemon membership and activity records.
 * @param {ClientWorkspaceStore} store - Saved project layouts, including detached windows.
 * @param {LayoutState} currentState - Current window layout before its next save.
 * @returns {readonly string[]} Chat identifiers eligible for automatic archive.
 */
export function getArchiveCandidates(
  chats: readonly WorkspaceChat[],
  store: ClientWorkspaceStore,
  currentState: LayoutState,
): readonly string[] {
  const displayed = displayedChatIds(store, currentState);
  // One week is a placeholder until the retention duration is configurable.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return chats
    .filter(
      (chat) =>
        !chat.archivedAt &&
        !displayed.has(chat.runId) &&
        !chat.attention.running &&
        !chat.attention.question &&
        !chat.attention.permission &&
        chat.lastActivityAt.getTime() < cutoff,
    )
    .map((chat) => chat.runId);
}
