import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  Archive,
  CircleAlert,
  Folder,
  Undo2,
  Circle,
  LoaderCircle,
  Plus,
  Settings,
  SquarePen,
  TriangleAlert,
  X,
} from "lucide-react";
import { Modal } from "../../design-system/Modal";
import { Button } from "../../design-system/Button";
import { useLayout } from "../../hooks/useLayout";
import { useOptionalWorkspaces } from "../../hooks/useWorkspaces";
import type {
  WorkspaceChat,
  WorkspaceProject,
} from "../../hooks/useWorkspaces";
import type { ClientWorkspaceStore } from "../../hooks/useLayout/useLayout.types";
import { listPanes } from "../../hooks/useLayout/layout";
import { useSettings } from "../../hooks/useSettings";
import { SettingsDialog } from "../SettingsDialog";
import { CreateWorkspaceDialog } from "../CreateWorkspaceDialog";
import { WorkspaceMenu } from "./WorkspaceMenu";
import styles from "./Sidebar.module.scss";

/**
 * Own project navigation, archive search, creation, and settings dialogs.
 * @returns {React.ReactElement} Project navigation and its controlled dialogs.
 */
export function Sidebar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveProjectId, setArchiveProjectId] = useState<string>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly WorkspaceChat[]>([]);
  const [searching, setSearching] = useState(false);
  const { newChat } = useLayout();
  const workspaces = useOptionalWorkspaces();
  const { settings } = useSettings();
  const handleSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const searchArchive = workspaces?.searchArchive;
  useEffect(() => {
    if (!archiveOpen || !searchArchive) {
      return;
    }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(
      () =>
        void searchArchive(query, archiveProjectId).then((chats) => {
          if (active) {
            setResults(chats);
            setSearching(false);
          }
        }),
      180,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, archiveOpen, archiveProjectId, searchArchive]);
  const undoChat = workspaces?.chats.find(
    (chat) => chat.runId === workspaces.undoRunId,
  );
  return (
    <>
      <SidebarRender
        onNewChat={() => {
          if (!workspaces?.pending) {
            newChat();
          }
        }}
        onSettings={handleSettings}
        projects={workspaces?.projects}
        chats={workspaces?.chats}
        projectId={workspaces?.projectId}
        store={workspaces?.store}
        paneHues={settings.paneHues}
        closeDisabled={workspaces?.pending}
        onProject={workspaces?.switchProject}
        onChat={workspaces?.revealChat}
        onCloseChat={
          workspaces
            ? (runId, stopRunning) =>
                workspaces.archiveChat(runId, { done: false, stopRunning })
            : undefined
        }
        onCreate={workspaces ? () => setCreateOpen(true) : undefined}
        onSearchArchive={
          workspaces
            ? (projectId) => {
                setArchiveProjectId(projectId ?? workspaces.projectId);
                setArchiveOpen(true);
              }
            : undefined
        }
        undo={
          undoChat ? () => void workspaces?.restoreChat(undoChat) : undefined
        }
        error={workspaces?.error}
      />
      {settingsOpen && <SettingsDialog onClose={handleCloseSettings} />}
      {createOpen && (
        <CreateWorkspaceDialog onClose={() => setCreateOpen(false)} />
      )}
      {archiveOpen && (
        <Modal
          open
          title="Archived chats"
          onClose={() => setArchiveOpen(false)}
        >
          <div className={styles.archiveSearch}>
            <label>
              Search archived chats
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search titles and messages"
              />
            </label>
            {searching && <p role="status">Searching...</p>}
            {!searching && !results.length && <p>No archived chats found.</p>}
            {results.map((chat) => (
              <div key={chat.runId}>
                <span>{chat.title || "Untitled chat"}</span>
                <Button
                  onClick={() =>
                    void workspaces
                      ?.restoreChat(chat)
                      .then(() => setArchiveOpen(false))
                  }
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Data and actions for workspace navigation. */
export interface SidebarRenderProps {
  readonly onNewChat: () => void;
  readonly onSettings: () => void;
  readonly projects?: readonly WorkspaceProject[];
  readonly chats?: readonly WorkspaceChat[];
  readonly projectId?: string;
  readonly store?: ClientWorkspaceStore;
  readonly paneHues?: Readonly<Record<string, number>>;
  readonly onProject?: (projectId: string) => void;
  readonly onChat?: (chat: WorkspaceChat) => void;
  readonly closeDisabled?: boolean;
  readonly onCloseChat?: (
    runId: string,
    stopRunning: boolean,
  ) => Promise<boolean>;
  readonly onCreate?: () => void;
  readonly onSearchArchive?: (projectId?: string) => void;
  readonly undo?: () => void;
  readonly error?: string;
}

/**
 * Keep workspace titles and their chats directly beneath New Chat.
 * @param {SidebarRenderProps} props - Project catalog and navigation actions.
 * @returns {React.ReactElement} Workspace navigation sidebar.
 */
export function SidebarRender({
  onNewChat,
  onSettings,
  projects = [],
  chats = [],
  projectId,
  store,
  paneHues,
  onProject,
  onChat,
  onCloseChat,
  closeDisabled = false,
  onCreate,
  onSearchArchive,
  undo,
  error,
}: SidebarRenderProps) {
  const [closeTarget, setCloseTarget] = useState<WorkspaceChat>();
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string>();
  const closeChat = useCallback(
    async (chat: WorkspaceChat, stopRunning: boolean) => {
      if (!onCloseChat || closing) {
        return;
      }
      setClosing(true);
      setCloseError(undefined);
      try {
        if (await onCloseChat(chat.runId, stopRunning)) {
          setCloseTarget(undefined);
        } else {
          setCloseError("Could not close this chat. Try again.");
        }
      } catch (closeFailure) {
        setCloseError(
          closeFailure instanceof Error
            ? closeFailure.message
            : "Could not close this chat.",
        );
      } finally {
        setClosing(false);
      }
    },
    [onCloseChat, closing],
  );
  const requestClose = useCallback(
    (chat: WorkspaceChat) => {
      if (closing || closeDisabled) {
        return;
      }
      if (
        chat.attention.running ||
        chat.attention.question ||
        chat.attention.permission
      ) {
        setCloseError(undefined);
        setCloseTarget(chat);
      } else {
        void closeChat(chat, false);
      }
    },
    [closeChat, closing, closeDisabled],
  );
  const [workspacePosition, setWorkspacePosition] = useState<{
    projectId: string;
    top: number;
    left: number;
    height: number;
  }>();
  const positionWorkspace = useCallback(
    (projectId: string, element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      setWorkspacePosition({
        projectId,
        top: bounds.top,
        left: bounds.left,
        height:
          element.firstElementChild instanceof HTMLElement
            ? element.firstElementChild.scrollHeight
            : bounds.height,
      });
    },
    [],
  );
  return (
    <div className={styles.rail}>
      <nav className={styles.sidebar} aria-label="Application">
        {onCreate && (
          <button
            className={styles.action}
            aria-label="Create workspace"
            onClick={onCreate}
          >
            <Plus size={18} aria-hidden="true" />
            <span className={styles.label}>Create workspace</span>
          </button>
        )}
        <button
          className={styles.action}
          aria-label="New chat"
          onClick={onNewChat}
        >
          <SquarePen size={18} aria-hidden="true" />
          <span className={styles.label}>New chat</span>
        </button>
        <div className={styles.projects}>
          {projects.map((project) => {
            const record = store?.workspaces[project.projectId];
            const collections = Object.values(
              record?.state.paneCollections ?? {},
            );
            const projectChats = chats.filter(
              (chat) =>
                chat.projectId === project.projectId && !chat.archivedAt,
            );
            const groups = [
              ...collections.map((collection) => ({
                paneId: collection.paneId,
                chats: projectChats.filter((chat) =>
                  collection.chatIds.includes(chat.runId),
                ),
              })),
              {
                paneId: "",
                chats: projectChats.filter(
                  (chat) =>
                    !collections.some((collection) =>
                      collection.chatIds.includes(chat.runId),
                    ),
                ),
              },
            ];
            const displayed = new Set(
              [record?.state, ...(record?.windowStates ?? [])].flatMap(
                (state) =>
                  state
                    ? listPanes(state.layout.root).flatMap(
                        (pane) => /^\/runs\/([^/]+)/.exec(pane.path)?.[1] ?? [],
                      )
                    : [],
              ),
            );
            const needsAttention = projectChats.some(
              (chat) => chat.attention.question || chat.attention.permission,
            );
            return (
              <section
                key={project.projectId}
                aria-label={project.name}
                className={styles.project}
                data-needs-attention={needsAttention}
                onPointerEnter={(event) =>
                  positionWorkspace(project.projectId, event.currentTarget)
                }
                onFocusCapture={(event) =>
                  positionWorkspace(project.projectId, event.currentTarget)
                }
                style={
                  workspacePosition?.projectId === project.projectId
                    ? ({
                        "--workspace-top": `${workspacePosition.top}px`,
                        "--workspace-left": `${workspacePosition.left}px`,
                        "--workspace-height": `${workspacePosition.height}px`,
                      } as CSSProperties)
                    : undefined
                }
              >
                <div className={styles.projectPanel}>
                  <div
                    className={styles.projectHeading}
                    data-active={project.projectId === projectId}
                  >
                    <button
                      className={`${styles.projectLink} ${needsAttention ? styles.projectAttention : ""}`}
                      aria-label={project.name}
                      key={String(needsAttention)}
                      onClick={() => onProject?.(project.projectId)}
                      title={project.cwd}
                    >
                      <Folder size={18} aria-hidden="true" />
                      <span className={styles.label}>{project.name}</span>
                    </button>
                    <span className={styles.projectMenuButton}>
                      <WorkspaceMenu
                        projectName={project.name}
                        onSearchArchive={
                          onSearchArchive
                            ? () => onSearchArchive(project.projectId)
                            : undefined
                        }
                      />
                    </span>
                  </div>
                  <div className={styles.projectChats}>
                    {groups
                      .filter((group) => group.chats.length)
                      .map((group) => (
                        <div
                          key={group.paneId}
                          className={styles.chatGroup}
                          style={
                            paneHues?.[group.paneId] === undefined
                              ? undefined
                              : ({
                                  "--group-hue": paneHues[group.paneId],
                                } as CSSProperties)
                          }
                          data-grouped={
                            Boolean(group.paneId) && group.chats.length > 1
                          }
                          data-colored={paneHues?.[group.paneId] !== undefined}
                        >
                          {group.chats.map((chat) => {
                            const viewing = displayed.has(chat.runId);
                            const attention = chat.attention.permission
                              ? "permission"
                              : chat.attention.question
                                ? "question"
                                : chat.attention.failed
                                  ? "failed"
                                  : chat.attention.running
                                    ? "running"
                                    : undefined;
                            return (
                              <div
                                className={styles.chatRow}
                                key={chat.runId}
                                data-viewing={viewing}
                                data-chat-row={chat.runId}
                              >
                                <button
                                  className={styles.chat}
                                  aria-label={`${chat.title || "Untitled chat"}${viewing ? " Viewing" : ""}`}
                                  onClick={() => onChat?.(chat)}
                                >
                                  <span
                                    className={`${styles.chatStatus} ${attention ? styles.attention : ""}`}
                                    data-attention={attention}
                                    role="img"
                                    aria-label={
                                      attention === "question"
                                        ? "Needs your response"
                                        : attention === "permission"
                                          ? "Permission needed"
                                          : attention === "failed"
                                            ? "Failed"
                                            : attention === "running"
                                              ? "Running"
                                              : chat.unread
                                                ? "Unread output"
                                                : "Viewed"
                                    }
                                  >
                                    {attention === "running" ? (
                                      <LoaderCircle
                                        size={14}
                                        aria-hidden="true"
                                        className={styles.spinner}
                                      />
                                    ) : attention === "question" ? (
                                      "?"
                                    ) : attention === "failed" ? (
                                      <X size={14} aria-hidden="true" />
                                    ) : attention === "permission" ? (
                                      <TriangleAlert
                                        size={14}
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Circle
                                        size={8}
                                        fill={
                                          chat.unread ? "currentColor" : "none"
                                        }
                                        aria-hidden="true"
                                      />
                                    )}
                                  </span>
                                </button>
                                <div className={styles.chatDetails}>
                                  <button
                                    className={styles.chatTitle}
                                    aria-label={`Open chat: ${chat.title || "Untitled chat"}`}
                                    onClick={() => onChat?.(chat)}
                                  >
                                    {chat.title || "Untitled chat"}
                                  </button>
                                  {onCloseChat && (
                                    <button
                                      className={styles.closeChat}
                                      title="Close chat"
                                      aria-label={`Close chat: ${chat.title || "Untitled chat"}`}
                                      disabled={closing || closeDisabled}
                                      onClick={(event) => {
                                        event.currentTarget
                                          .closest("[data-chat-row]")
                                          ?.querySelector<HTMLButtonElement>(
                                            `button.${styles.chat}`,
                                          )
                                          ?.focus();
                                        requestClose(chat);
                                      }}
                                    >
                                      <X size={14} aria-hidden="true" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
        {error && (
          <p
            role="alert"
            aria-label={error}
            tabIndex={0}
            className={styles.error}
            title={error}
          >
            <CircleAlert size={18} aria-hidden="true" />
            <span className={styles.label}>{error}</span>
          </p>
        )}
        {undo && (
          <div className={styles.undo} role="status">
            <button
              className={styles.action}
              aria-label="Undo archive"
              onClick={undo}
            >
              <Undo2 size={18} aria-hidden="true" />
              <span className={styles.label}>Chat archived. Undo</span>
            </button>
          </div>
        )}
        <div className={styles.footer}>
          {onSearchArchive && (
            <button
              className={styles.action}
              aria-label="Archived chats"
              onClick={() => onSearchArchive()}
            >
              <Archive size={18} aria-hidden="true" />
              <span className={styles.label}>Archived chats</span>
            </button>
          )}
          <button
            className={styles.action}
            aria-label="Settings"
            onClick={onSettings}
          >
            <Settings size={18} aria-hidden="true" />
            <span className={styles.label}>Settings</span>
          </button>
        </div>
      </nav>
      {closeTarget && (
        <Modal
          open
          title="Close running chat?"
          onClose={() => {
            if (!closing) {
              setCloseTarget(undefined);
            }
          }}
        >
          <div className={styles.closeConfirmation}>
            <p>
              “{closeTarget.title || "Untitled chat"}” still has active work.
              Closing it will stop the run and move the chat to the archive. Its
              history will be kept.
            </p>
            {(closeError || error) && <p role="alert">{error ?? closeError}</p>}
            <footer>
              <Button
                autoFocus
                disabled={closing}
                onClick={() => setCloseTarget(undefined)}
              >
                Cancel
              </Button>
              <Button
                disabled={closing}
                onClick={() => void closeChat(closeTarget, true)}
              >
                {closing ? "Closing..." : "Stop and close"}
              </Button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}
