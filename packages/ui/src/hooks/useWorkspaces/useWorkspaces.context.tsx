import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useCommaAgentsDaemon } from "../useCommaAgentsDaemon";
import { useDaemonMutation } from "../useDaemonMutation";
import { useViewedChats } from "./useViewedChats";
import { useSettings } from "../useSettings";
import { useHost } from "../useHost";
import { useLayout } from "../useLayout";
import { layoutReducer } from "../useLayout/useLayout.reducer";
import { createLayout, listPanes } from "../useLayout/layout";
import type {
  ClientWorkspaceStore,
  LayoutState,
} from "../useLayout/useLayout.types";
import type {
  ArchiveChatOptions,
  CreateWorkspaceOptions,
  WorkspaceChat,
  WorkspacesContextValue,
} from "./useWorkspaces.types";
import {
  collectPaneChats,
  copyWorkspaceState,
  decodeChat,
  getArchiveCandidates,
  loadClientWorkspaces,
  remapWorkspacePanes,
} from "./useWorkspaces.utils";

export const WorkspacesContext = createContext<WorkspacesContextValue | null>(
  null,
);
const subscribeBrowser = () => () => {};
const browserSnapshot = () => undefined;

/**
 * Own saved workspace presentation while following daemon membership and attention.
 * @param {{children: ReactNode}} props - Components sharing workspace presentation.
 * @returns {React.ReactElement} Workspace context wrapping its children.
 */
export function WorkspacesProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const layout = useLayout();
  const { replaceState, setPanePath } = layout;
  const { settings, saveSettings } = useSettings();
  const { workspace } = useHost();
  const remote = useSyncExternalStore(
    workspace?.subscribe ?? subscribeBrowser,
    workspace?.getSnapshot ?? browserSnapshot,
  );
  const [localStore, setStore] = useState<ClientWorkspaceStore>(
    () => workspace?.getSnapshot().clientWorkspaces ?? loadClientWorkspaces(),
  );
  const store = remote?.clientWorkspaces ?? localStore;
  const projectId = remote?.projectId ?? store.activeProjectId;
  const watched = useCommaAgentsDaemon({ channel: "projects.watch" }, {});
  const projects = useMemo(
    () =>
      (watched.data?.data.projects ?? []).map((project) => ({
        ...project,
        createdAt: new Date(project.createdAt),
      })),
    [watched.data],
  );
  const catalogChats = useMemo(
    () => (watched.data?.data.chats ?? []).map(decodeChat),
    [watched.data],
  );
  const chats = useViewedChats(catalogChats, layout.layout);
  const project = projects.find((entry) => entry.projectId === projectId);
  const { attempt: create } = useDaemonMutation("projects.create");
  const { attempt: assign } = useDaemonMutation("projects.assign");
  const { attempt: activity } = useDaemonMutation("projects.activity");
  const { attempt: archive } = useDaemonMutation("projects.archive");
  const { attempt: stop } = useDaemonMutation("runs.stop");
  const { attempt: sweepArchive } = useDaemonMutation("projects.archive");
  const { attempt: restore } = useDaemonMutation("projects.restore");
  const { attempt: search } = useDaemonMutation("projects.search");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submissionCount = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const beginSubmission = useCallback(() => {
    submissionCount.current += 1;
    setSubmitting(true);
  }, []);
  const endSubmission = useCallback(() => {
    submissionCount.current = Math.max(0, submissionCount.current - 1);
    setSubmitting(submissionCount.current > 0);
  }, []);
  const [undoRunId, setUndoRunId] = useState<string>();
  const creationRequest = useRef<
    { fingerprint: string; requestId: string } | undefined
  >(undefined);
  const searchQueue = useRef<Promise<unknown>>(Promise.resolve());
  const currentState: LayoutState = useMemo(
    () =>
      collectPaneChats({
        layout: layout.layout,
        strategyChoices: layout.strategyChoices,
        paneCollections: layout.paneCollections,
        maximizedId: layout.maximizedId,
      }),
    [
      layout.layout,
      layout.strategyChoices,
      layout.paneCollections,
      layout.maximizedId,
    ],
  );
  const latest = useRef({ store, projectId, state: currentState, chats });
  latest.current = { store, projectId, state: currentState, chats };
  const save = useCallback(
    (value: ClientWorkspaceStore) => {
      setStore(value);
      if (workspace) {
        workspace.send({ type: "saveClientWorkspaces", value });
      } else {
        try {
          localStorage.setItem(
            "comma-agents.workspaces",
            JSON.stringify(value),
          );
        } catch {
          /* Storage can be unavailable. */
        }
      }
    },
    [workspace],
  );
  // Host layout updates already commit to its authoritative workspace records.
  useEffect(() => {
    if (workspace) {
      return;
    }
    setStore((previous) => {
      const next = {
        ...previous,
        workspaces: {
          ...previous.workspaces,
          [previous.activeProjectId]: {
            projectId: previous.activeProjectId,
            state: currentState,
          },
        },
      };
      try {
        localStorage.setItem("comma-agents.workspaces", JSON.stringify(next));
      } catch {
        /* Storage can be unavailable. */
      }
      return next;
    });
  }, [currentState, workspace]);
  const switchProject = useCallback(
    (nextProjectId: string) => {
      const current = latest.current;
      if (
        submissionCount.current ||
        workspace?.getSnapshot().submissionPending
      ) {
        setError("Wait for the new chat to finish starting.");
        return;
      }
      if (nextProjectId === current.projectId) {
        return;
      }
      const nextState = current.store.workspaces[nextProjectId]?.state ?? {
        layout: createLayout(),
        strategyChoices: {},
      };
      const next = {
        activeProjectId: nextProjectId,
        workspaces: {
          ...current.store.workspaces,
          [current.projectId]: {
            ...current.store.workspaces[current.projectId],
            projectId: current.projectId,
            state: current.state,
          },
          [nextProjectId]: {
            ...current.store.workspaces[nextProjectId],
            projectId: nextProjectId,
            state: nextState,
          },
        },
      };
      save(next);
      if (workspace) {
        workspace.send({
          type: "switchProject",
          projectId: nextProjectId,
          state: nextState,
        });
      } else {
        replaceState(nextState);
      }
    },
    [save, workspace, replaceState],
  );
  const revealChat = useCallback(
    (chat: WorkspaceChat) => {
      if (
        submissionCount.current ||
        workspace?.getSnapshot().submissionPending
      ) {
        setError("Wait for the new chat to finish starting.");
        return;
      }
      void activity({ runId: chat.runId });
      const current = latest.current;
      const record = current.store.workspaces[chat.projectId];
      const state =
        chat.projectId === current.projectId
          ? current.state
          : (record?.state ?? { layout: createLayout(), strategyChoices: {} });
      const collection = Object.values({
        ...record?.state.paneCollections,
        ...state.paneCollections,
      }).find((entry) => entry.chatIds.includes(chat.runId));
      if (workspace) {
        if (chat.projectId !== current.projectId) {
          switchProject(chat.projectId);
        }
        workspace.send({
          type: "revealChat",
          runId: chat.runId,
          paneId: collection?.paneId ?? state.layout.activeId,
          projectId: chat.projectId,
        });
        return;
      }
      const restored = layoutReducer(state, {
        type: "restore",
        paneId: collection?.paneId ?? state.layout.activeId,
        runId: chat.runId,
      });
      save({
        activeProjectId: chat.projectId,
        workspaces: {
          ...current.store.workspaces,
          [current.projectId]: {
            ...current.store.workspaces[current.projectId],
            projectId: current.projectId,
            state: current.state,
          },
          [chat.projectId]: {
            ...record,
            projectId: chat.projectId,
            state: restored,
          },
        },
      });
      replaceState(restored);
    },
    [replaceState, switchProject, workspace, save, activity],
  );
  const createProject = useCallback(
    async (options: CreateWorkspaceOptions) => {
      if (
        submissionCount.current ||
        workspace?.getSnapshot().submissionPending
      ) {
        setError("Wait for the new chat to finish starting.");
        return false;
      }
      setPending(true);
      setError(undefined);
      const current = latest.current;
      const fingerprint = JSON.stringify({
        ...options,
        sourceProjectId: current.projectId,
      });
      if (creationRequest.current?.fingerprint !== fingerprint) {
        creationRequest.current = {
          fingerprint,
          requestId: crypto.randomUUID(),
        };
      }
      const result = await create({
        requestId: creationRequest.current.requestId,
        name: options.name,
        cwd: options.cwd,
        sourceProjectId: current.projectId,
        mode: options.mode,
        runIds: [...options.runIds],
        checkpoints: options.checkpoints
          ? { ...options.checkpoints }
          : undefined,
      });
      setPending(false);
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      const destinationId = result.data.project.projectId;
      const sourceRecord = current.store.workspaces[current.projectId];
      const sourceState = {
        ...current.state,
        paneCollections: {
          ...sourceRecord?.state.paneCollections,
          ...current.state.paneCollections,
        },
      };
      const generalTransfer = current.projectId === "general";
      const runIdMap =
        options.mode === "fresh" && !generalTransfer
          ? {}
          : result.data.runIdMap;
      let destination = copyWorkspaceState(sourceState, runIdMap);
      let windowStates = sourceRecord?.windowStates?.map((state) =>
        copyWorkspaceState(state, runIdMap),
      );
      if (!generalTransfer) {
        let remapped = remapWorkspacePanes(destination);
        windowStates = windowStates?.map((state) => {
          const detached = remapWorkspacePanes(state, remapped.paneIdMap);
          remapped = { ...remapped, paneIdMap: detached.paneIdMap };
          return detached.state;
        });
        destination = remapped.state;
        const paneHues = { ...settings.paneHues };
        for (const [oldId, newId] of Object.entries(remapped.paneIdMap)) {
          if (settings.paneHues?.[oldId] !== undefined) {
            paneHues[newId] = settings.paneHues[oldId]!;
          }
          for (const preference of ["centered", "draft"]) {
            try {
              const value = localStorage.getItem(
                `comma-agents.${preference}.${oldId}`,
              );
              if (value !== null) {
                localStorage.setItem(
                  `comma-agents.${preference}.${newId}`,
                  value,
                );
              }
            } catch {
              /* Preserve layout even if browser preferences cannot be saved. */
            }
          }
        }
        for (const [oldRunId, newRunId] of Object.entries(runIdMap)) {
          if (oldRunId === newRunId) {
            continue;
          }
          try {
            const draft = localStorage.getItem(
              `comma-agents.draft.run.${oldRunId}`,
            );
            if (draft !== null) {
              localStorage.setItem(`comma-agents.draft.run.${newRunId}`, draft);
            }
          } catch {
            /* Keep copied chats available when draft storage is unavailable. */
          }
        }
        saveSettings({ ...settings, paneHues });
      }
      const archivedIds = new Set(
        chats
          .filter(
            (chat) => chat.projectId === current.projectId && chat.archivedAt,
          )
          .map((chat) => chat.runId),
      );
      const retainedRunIdMap = Object.fromEntries(
        chats
          .filter(
            (chat) =>
              chat.projectId === current.projectId &&
              !options.runIds.includes(chat.runId),
          )
          .map((chat) => [chat.runId, chat.runId]),
      );
      const sourceWindowStates = generalTransfer
        ? []
        : options.mode === "move"
          ? sourceRecord?.windowStates?.map((state) =>
              copyWorkspaceState(state, retainedRunIdMap),
            )
          : sourceRecord?.windowStates;
      const source = generalTransfer
        ? {
            layout: createLayout(),
            strategyChoices: sourceState.strategyChoices,
            paneCollections: Object.fromEntries(
              Object.entries(sourceState.paneCollections ?? {})
                .map(
                  ([paneId, collection]) =>
                    [
                      paneId,
                      {
                        ...collection,
                        closed: true,
                        selectedChatId: undefined,
                        chatIds: collection.chatIds.filter((runId) =>
                          archivedIds.has(runId),
                        ),
                      },
                    ] as const,
                )
                .filter(([, collection]) => collection.chatIds.length),
            ),
          }
        : options.mode === "move"
          ? copyWorkspaceState(sourceState, retainedRunIdMap)
          : sourceState;
      save({
        activeProjectId: destinationId,
        workspaces: {
          ...current.store.workspaces,
          [current.projectId]: {
            projectId: current.projectId,
            state: source,
            windowStates: sourceWindowStates,
          },
          [destinationId]: {
            projectId: destinationId,
            state: destination,
            windowStates,
          },
        },
      });
      if (workspace) {
        workspace.send({
          type: "switchProject",
          projectId: destinationId,
          state: destination,
        });
      } else {
        replaceState(destination);
      }
      creationRequest.current = undefined;
      return true;
    },
    [create, save, workspace, replaceState, chats, settings, saveSettings],
  );
  const archiveChat = useCallback(
    async (runId: string, options?: ArchiveChatOptions) => {
      const chat = chats.find((entry) => entry.runId === runId);
      if (
        !chat ||
        submissionCount.current ||
        workspace?.getSnapshot().submissionPending
      ) {
        return false;
      }
      const active =
        chat.attention.running ||
        chat.attention.question ||
        chat.attention.permission;
      if (active && !options?.stopRunning) {
        return false;
      }
      setError(undefined);
      if (options?.stopRunning) {
        const stopped = await stop({ runId });
        if (!stopped.ok) {
          setError(stopped.error.message);
          return false;
        }
      }
      const result = await archive({ runId, done: options?.done ?? true });
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      setUndoRunId(runId);
      const current = latest.current;
      const record = current.store.workspaces[chat.projectId];
      const mainState =
        chat.projectId === current.projectId ? current.state : record?.state;
      const pane = [mainState, ...(record?.windowStates ?? [])]
        .flatMap((state) => (state ? listPanes(state.layout.root) : []))
        .find((entry) => entry.path === `/runs/${runId}`);
      if (pane && workspace) {
        workspace.send({
          type: "newChatInPane",
          projectId: chat.projectId,
          paneId: pane.id,
          runId,
        });
      } else if (pane && chat.projectId === current.projectId) {
        setPanePath(pane.id, "/");
      } else if (pane && record) {
        save({
          ...current.store,
          workspaces: {
            ...current.store.workspaces,
            [chat.projectId]: {
              ...record,
              state: layoutReducer(record.state, {
                type: "path",
                id: pane.id,
                path: "/",
              }),
            },
          },
        });
      }
      return true;
    },
    [chats, archive, stop, setPanePath, workspace, save],
  );
  const restoreChat = useCallback(
    async (chat: WorkspaceChat) => {
      const result = await restore({ runId: chat.runId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setUndoRunId(undefined);
      revealChat(chat);
    },
    [restore, revealChat],
  );
  const searchArchive = useCallback(
    (
      query: string,
      targetProjectId?: string,
    ): Promise<readonly WorkspaceChat[]> => {
      const operation = searchQueue.current.then(async () => {
        const found: WorkspaceChat[] = [];
        let offset = 0;
        for (;;) {
          const result = await search({
            projectId: targetProjectId ?? projectId,
            query,
            offset,
            limit: 100,
          });
          if (!result.ok) {
            setError(result.error.message);
            return found;
          }
          found.push(...result.data.chats.map(decodeChat));
          if (
            result.data.nextOffset === undefined ||
            result.data.nextOffset <= offset
          ) {
            return found;
          }
          offset = result.data.nextOffset;
        }
      });
      searchQueue.current = operation;
      return operation;
    },
    [search, projectId],
  );
  const registerChat = useCallback(
    async (runId: string, title?: string) => {
      const result = await assign({ projectId, runId, title });
      if (!result.ok) {
        setError(result.error.message);
      }
      return result.ok;
    },
    [assign, projectId],
  );
  useEffect(() => {
    if (remote?.detached) {
      return;
    }
    let disposed = false;
    const sweep = async () => {
      const saved = latest.current;
      for (const runId of getArchiveCandidates(
        saved.chats,
        saved.store,
        saved.state,
      )) {
        if (disposed) {
          return;
        }
        const current = latest.current;
        if (
          submissionCount.current ||
          !getArchiveCandidates(
            current.chats,
            current.store,
            current.state,
          ).includes(runId)
        ) {
          continue;
        }
        await sweepArchive({ runId });
      }
    };
    void sweep();
    const timer = window.setInterval(() => void sweep(), 60_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [chats, sweepArchive, remote?.detached]);
  const value: WorkspacesContextValue = {
    projectId,
    project,
    projects,
    chats,
    store,
    state: currentState,
    error: error ?? watched.errors?.message ?? watched.clientError?.message,
    pending: pending || submitting || remote?.submissionPending === true,
    undoRunId,
    beginSubmission,
    endSubmission,
    switchProject,
    revealChat,
    createProject,
    archiveChat,
    restoreChat,
    searchArchive,
    registerChat,
  };
  return (
    <WorkspacesContext.Provider value={value}>
      {children}
    </WorkspacesContext.Provider>
  );
}
