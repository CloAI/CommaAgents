import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../design-system/Modal";
import { Button } from "../../design-system/Button";
import { useDaemonMutation } from "../../hooks/useDaemonMutation";
import { useHost } from "../../hooks/useHost";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import type {
  CreateWorkspaceOptions,
  WorkspaceChat,
} from "../../hooks/useWorkspaces";
import styles from "./CreateWorkspaceDialog.module.scss";

/**
 * Collect a project's directory and which existing chats to carry into it.
 * @param {{onClose: () => void}} props - Dialog dismissal callback.
 * @returns {React.ReactElement} Controlled workspace creation dialog.
 */
export function CreateWorkspaceDialog({
  onClose,
}: {
  readonly onClose: () => void;
}) {
  const { projectId, project, chats, createProject, pending, error } =
    useWorkspaces();
  const { chooseDirectory } = useHost();
  const [name, setName] = useState("");
  const [cwd, setCwd] = useState(project?.cwd ?? "");
  const [mode, setMode] = useState<CreateWorkspaceOptions["mode"]>("fresh");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [checkpoints, setCheckpoints] = useState<
    Readonly<Record<string, string | null>>
  >({});
  const [confirmed, setConfirmed] = useState(false);
  const checkpointQueue = useRef<Promise<unknown>>(Promise.resolve());
  const { attempt: getCheckpoint } = useDaemonMutation(
    "runs.getCopyCheckpoint",
  );
  const candidates = useMemo(
    () =>
      chats.filter((chat) => chat.projectId === projectId && !chat.archivedAt),
    [chats, projectId],
  );
  const candidateIds = JSON.stringify(
    candidates.map((chat) => chat.runId).sort(),
  );
  useEffect(() => {
    if (mode !== "copy") {
      return;
    }
    let active = true;
    void (async () => {
      for (const runId of JSON.parse(candidateIds) as string[]) {
        if (!active) {
          return;
        }
        const operation = checkpointQueue.current.then(() =>
          getCheckpoint({ runId }),
        );
        checkpointQueue.current = operation;
        const result = await operation;
        if (active) {
          setCheckpoints((previous) => ({
            ...previous,
            [runId]: result.ok
              ? (result.data.checkpoint?.checkpointId ?? null)
              : null,
          }));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, candidateIds, getCheckpoint]);
  const eligibleSelected =
    mode === "copy" ? selected.filter((runId) => checkpoints[runId]) : selected;
  const requiresConfirmation =
    mode === "copy" &&
    candidates.some(
      (chat) => chat.attention.running && eligibleSelected.includes(chat.runId),
    );
  return (
    <CreateWorkspaceDialogRender
      name={name}
      cwd={cwd}
      mode={mode}
      general={projectId === "general"}
      chats={candidates}
      selected={eligibleSelected}
      checkpoints={checkpoints}
      confirmed={confirmed}
      requiresConfirmation={requiresConfirmation}
      onConfirmed={setConfirmed}
      pending={pending}
      error={error}
      onName={setName}
      onCwd={setCwd}
      onMode={(nextMode) => {
        setMode(nextMode);
        setConfirmed(false);
      }}
      onToggle={(runId) => {
        setSelected((previous) =>
          previous.includes(runId)
            ? previous.filter((entry) => entry !== runId)
            : [...previous, runId],
        );
        setConfirmed(false);
      }}
      onBrowse={
        chooseDirectory
          ? async () => {
              const directory = await chooseDirectory(cwd);
              if (directory) {
                setCwd(directory);
              }
            }
          : undefined
      }
      onClose={onClose}
      onSubmit={async () => {
        if (requiresConfirmation && !confirmed) {
          return;
        }
        const reviewed = Object.fromEntries(
          eligibleSelected.flatMap((runId) =>
            checkpoints[runId] ? [[runId, checkpoints[runId]!]] : [],
          ),
        );
        if (
          await createProject({
            name,
            cwd,
            mode: projectId === "general" ? "move" : mode,
            runIds:
              projectId === "general"
                ? candidates.map((chat) => chat.runId)
                : mode === "fresh"
                  ? []
                  : eligibleSelected,
            checkpoints: mode === "copy" ? reviewed : undefined,
          })
        ) {
          onClose();
        }
      }}
    />
  );
}

/** Explicit data and actions for the project creation form. */
export interface CreateWorkspaceDialogRenderProps {
  readonly name: string;
  readonly cwd: string;
  readonly mode: CreateWorkspaceOptions["mode"];
  readonly general: boolean;
  readonly chats: readonly WorkspaceChat[];
  readonly selected: readonly string[];
  readonly checkpoints?: Readonly<Record<string, string | null>>;
  readonly confirmed?: boolean;
  readonly requiresConfirmation?: boolean;
  readonly onConfirmed?: (confirmed: boolean) => void;
  readonly pending: boolean;
  readonly error?: string;
  readonly onName: (name: string) => void;
  readonly onCwd: (cwd: string) => void;
  readonly onMode: (mode: CreateWorkspaceOptions["mode"]) => void;
  readonly onToggle: (runId: string) => void;
  readonly onBrowse?: () => Promise<void>;
  readonly onClose: () => void;
  readonly onSubmit: () => Promise<void>;
}
/**
 * Render the accessible creation form; directory selection is host-dependent.
 * @param {CreateWorkspaceDialogRenderProps} props - Creation form state and explicit user actions.
 * @returns {React.ReactElement} Workspace form with directory and chat selection.
 */
export function CreateWorkspaceDialogRender(
  props: CreateWorkspaceDialogRenderProps,
) {
  return (
    <Modal open title="Create workspace" onClose={props.onClose}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void props.onSubmit();
        }}
      >
        <label>
          Name
          <input
            autoFocus
            required
            value={props.name}
            onChange={(event) => props.onName(event.target.value)}
          />
        </label>
        <label>
          Working directory
          <div className={styles.directory}>
            <input
              required
              value={props.cwd}
              onChange={(event) => props.onCwd(event.target.value)}
            />
            {props.onBrowse && (
              <Button type="button" onClick={() => void props.onBrowse?.()}>
                Browse
              </Button>
            )}
          </div>
        </label>
        {props.general ? (
          <p>
            All open and closed unarchived chats move from General, keeping
            their pane arrangement. General starts fresh. Archived chats stay in
            General.
          </p>
        ) : (
          <>
            <fieldset>
              <legend>Start with</legend>
              {(["fresh", "copy", "move"] as const).map((mode) => (
                <label key={mode}>
                  <input
                    type="radio"
                    name="mode"
                    checked={props.mode === mode}
                    onChange={() => props.onMode(mode)}
                  />
                  {mode === "fresh"
                    ? "Fresh chats"
                    : mode === "copy"
                      ? "Copy selected chats"
                      : "Move selected chats"}
                </label>
              ))}
            </fieldset>
            {props.mode !== "fresh" && (
              <fieldset>
                <legend>Chats</legend>
                {props.chats.length ? (
                  props.chats.map((chat) => (
                    <label key={chat.runId}>
                      <input
                        type="checkbox"
                        disabled={
                          props.mode === "copy" &&
                          !props.checkpoints?.[chat.runId]
                        }
                        checked={props.selected.includes(chat.runId)}
                        onChange={() => props.onToggle(chat.runId)}
                      />
                      {chat.title || "Untitled chat"}
                      {chat.attention.running && " (running)"}
                      {props.mode === "copy" &&
                        !props.checkpoints?.[chat.runId] &&
                        (props.checkpoints?.[chat.runId] === null
                          ? " - no completed response yet"
                          : " - checking completed responses...")}
                    </label>
                  ))
                ) : (
                  <p>No unarchived chats.</p>
                )}
              </fieldset>
            )}
          </>
        )}
        {props.requiresConfirmation && (
          <label>
            <input
              type="checkbox"
              checked={props.confirmed ?? false}
              onChange={(event) => props.onConfirmed?.(event.target.checked)}
            />
            Running chats will be copied from their last completed response.
            Newer work will stay in the original chat.
          </label>
        )}
        {props.error && <p role="alert">{props.error}</p>}
        <footer>
          <Button
            type="button"
            onClick={props.onClose}
            disabled={props.pending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              props.pending ||
              !props.name.trim() ||
              !props.cwd.trim() ||
              (props.requiresConfirmation && !props.confirmed)
            }
          >
            {props.pending ? "Creating..." : "Create workspace"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
