import type { z } from "zod/v4";
import type { Plugin } from "../../daemon-plugin";
import type { RunsPlugin } from "../runs";
import type { QuestionsPlugin } from "../questions";
import type { SandboxPlugin } from "../sandbox";
import type {
  CreateProjectSchema,
  AssignProjectChatSchema,
  ProjectActivitySchema,
  ArchiveProjectChatSchema,
  SearchProjectArchiveSchema,
} from "./projects.schemas";

/** A project owns conversations independently from their execution state. */
export interface Project {
  /** Stable project identity; General uses `general`. */
  readonly projectId: string;
  /** User-visible project name. */
  readonly name: string;
  /** Absolute working directory on the daemon machine. */
  readonly cwd: string;
  /** Time the project was created. */
  readonly createdAt: Date;
}
/** Persistent root-conversation membership and user activity. */
export interface ProjectChat {
  /** Root conversation identity. */
  readonly runId: string;
  /** Stable project identity; General uses `general`. */
  readonly projectId: string;
  /** Searchable conversation title. */
  readonly title: string;
  /** Last time a client recorded viewing or interacting with this chat. */
  readonly lastActivityAt: Date;
  /** Time the user explicitly marked the conversation done. */
  readonly doneAt?: Date;
  /** Time the conversation left the current working set. */
  readonly archivedAt?: Date;
}
/** Current observable work and unresolved decisions, including descendants. */
export interface ChatAttention {
  /** Root or descendant execution is preparing or running. */
  readonly running: boolean;
  /** A question-tool request awaits an answer, including descendants. */
  readonly question: boolean;
  /** Root or descendant execution awaits permission. */
  readonly permission: boolean;
  /** The root execution ended in failure. */
  readonly failed: boolean;
}
/** Membership with live activity for sidebar clients. */
export interface ProjectChatStatus extends ProjectChat {
  /** Latest finalized display entry, used by clients to recognize new output. */
  readonly latestEntryId?: string;
  /** Current work and unresolved user decisions. */
  readonly attention: ChatAttention;
}
/** Project directory and all root conversation memberships. */
export interface ProjectCatalog {
  /** All projects, including General. */
  readonly projects: readonly Project[];
  /** Root conversations with membership and current attention state. */
  readonly chats: readonly ProjectChatStatus[];
}
/** Receipt retained to replay project creation safely. */
export interface CreateProjectResult {
  /** Created project, also returned on an identical request replay. */
  readonly project: Project;
  /** Source-to-destination root IDs; moves retain their original IDs. */
  readonly runIdMap: Readonly<Record<string, string>>;
}
/** Creation choices; use a stable request ID when retrying. */
export type CreateProjectOptions = z.input<typeof CreateProjectSchema>;
/** Existing root conversation to adopt into a project. */
export type AssignProjectChatOptions = z.input<typeof AssignProjectChatSchema>;
/** Conversation activity and optional replacement title. */
export type ProjectActivityOptions = z.input<typeof ProjectActivitySchema>;
/** Archival with optional explicit user completion. */
export type ArchiveProjectChatOptions = z.input<
  typeof ArchiveProjectChatSchema
>;
/** Project archive query and pagination bounds. */
export type SearchProjectArchiveOptions = z.input<
  typeof SearchProjectArchiveSchema
>;
/** Paginated archived conversations matching title or finalized visible text. */
export interface ProjectArchivePage {
  /** Root conversations with membership and current attention state. */
  readonly chats: readonly ProjectChatStatus[];
  /** Total archived conversations matching the query. */
  readonly total: number;
  /** Offset for the next page, absent at the end. */
  readonly nextOffset?: number;
}
/** Storage and run services supplied to the project catalog. */
export interface CreateProjectsPluginOptions {
  /** Absolute path where project membership is persisted. */
  readonly catalogFile: string;
  /** Initial directory of General. @default process.cwd() */
  readonly defaultCwd?: string;
  /** Services used to copy, inspect, and observe conversations. */
  readonly dependencies: {
    /** Run execution, history, and completed-response copies. */
    readonly runs: RunsPlugin;
    /** Unresolved questionnaires and their updates. */
    readonly questions: QuestionsPlugin;
    /** Unresolved permission requests and their updates. */
    readonly sandbox: SandboxPlugin;
  };
}
/** Serverless project membership, archive, and aggregate run observation. */
export interface ProjectsPlugin extends Plugin<"projects"> {
  /** Read all memberships with current aggregate attention state. */
  list(): Promise<ProjectCatalog>;
  /** Create once per request ID, optionally copying or moving selected conversations. */
  create(options: CreateProjectOptions): Promise<CreateProjectResult>;
  /** Adopt an existing unassigned root conversation. */
  assign(options: AssignProjectChatOptions): Promise<ProjectChatStatus>;
  /** Record a view or interaction, optionally updating its title. */
  activity(options: ProjectActivityOptions): Promise<ProjectChatStatus>;
  /** Archive idle work, optionally recording explicit completion. */
  archive(options: ArchiveProjectChatOptions): Promise<ProjectChatStatus>;
  /** Return an archived conversation to its project working set. */
  restore(runId: string): Promise<ProjectChatStatus>;
  /** Search archived titles and finalized visible text within one project. */
  search(options: SearchProjectArchiveOptions): Promise<ProjectArchivePage>;
  /** Receive an initial catalog and live aggregate updates until unsubscribed. */
  watch(listener: (catalog: ProjectCatalog) => void): Promise<() => void>;
}
