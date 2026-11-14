import type { DaemonCommandMap } from "@comma-agents/daemon/protocol";
import type {
  ClientWorkspaceStore,
  LayoutState,
} from "../useLayout/useLayout.types";

/** One project's chat catalog, with ISO timestamps decoded at the UI boundary. */
export type WorkspaceChat = Omit<
  DaemonCommandMap["projects.list"]["result"]["chats"][number],
  "lastActivityAt" | "archivedAt" | "doneAt"
> & {
  /** Finalized output that has not been viewed in this client. */
  readonly unread?: boolean;
  readonly lastActivityAt: Date;
  readonly archivedAt?: Date;
  readonly doneAt?: Date;
};
export type WorkspaceProject = Omit<
  DaemonCommandMap["projects.list"]["result"]["projects"][number],
  "createdAt"
> & { readonly createdAt: Date };
export interface CreateWorkspaceOptions {
  readonly name: string;
  readonly cwd: string;
  readonly mode: "fresh" | "copy" | "move";
  readonly runIds: readonly string[];
  readonly checkpoints?: Readonly<Record<string, string>>;
}
/** Explicit completion or closing behavior for an archived chat. */
export interface ArchiveChatOptions {
  /** Mark the task complete rather than only closing the chat. @default true */
  readonly done?: boolean;
  /** Stop active execution before closing, after user confirmation. @default false */
  readonly stopRunning?: boolean;
}
/** Project catalog and client-owned layout operations. */
export interface WorkspacesContextValue {
  readonly projectId: string;
  readonly project?: WorkspaceProject;
  readonly projects: readonly WorkspaceProject[];
  readonly chats: readonly WorkspaceChat[];
  readonly store: ClientWorkspaceStore;
  readonly error?: string;
  readonly pending: boolean;
  readonly undoRunId?: string;
  readonly switchProject: (projectId: string) => void;
  readonly revealChat: (chat: WorkspaceChat) => void;
  readonly createProject: (options: CreateWorkspaceOptions) => Promise<boolean>;
  readonly archiveChat: (
    runId: string,
    options?: ArchiveChatOptions,
  ) => Promise<boolean>;
  readonly restoreChat: (chat: WorkspaceChat) => Promise<void>;
  readonly searchArchive: (
    query: string,
    projectId?: string,
  ) => Promise<readonly WorkspaceChat[]>;
  readonly registerChat: (runId: string, title?: string) => Promise<boolean>;
  readonly beginSubmission: () => void;
  readonly endSubmission: () => void;
  readonly state: LayoutState;
}
