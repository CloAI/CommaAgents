import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { createPlugin } from "../../daemon-plugin";
import {
  ArchiveProjectChatSchema,
  AssignProjectChatSchema,
  CreateProjectSchema,
  ProjectActivitySchema,
  SearchProjectArchiveSchema,
} from "./projects.schemas";
import { readProjects, writeProjects } from "./projects.storage";
import type { ProjectStorageState } from "./projects.storage";
import { getChatAttention } from "./projects.attention";
import { projectCommands, projectWatchChannel } from "./projects.server";
import type {
  CreateProjectsPluginOptions,
  Project,
  ProjectCatalog,
  ProjectChat,
  ProjectChatStatus,
  ProjectsPlugin,
} from "./projects.types";

/** Stable unorganized-work membership, independent of any client's active project. */
export const GENERAL_PROJECT_ID = "general";

/**
 * Validate paths on the daemon machine rather than a browser's machine.
 * @param {string} cwd - Requested absolute working directory.
 * @returns {Promise<string>} Validated absolute directory.
 */
async function projectDirectory(cwd: string): Promise<string> {
  if (!isAbsolute(cwd)) {
    throw new Error("Project directory must be an absolute path.");
  }
  const resolved = resolve(cwd);
  if (!(await stat(resolved)).isDirectory()) {
    throw new Error("Project directory is not a directory.");
  }
  return resolved;
}

/**
 * Own durable project membership without owning panes, layouts, or archive policy.
 * @param {CreateProjectsPluginOptions} options - Catalog storage and feature APIs.
 * @returns {Promise<ProjectsPlugin>} Initialized project catalog and transport bindings.
 */
export async function createProjectsPlugin(
  options: CreateProjectsPluginOptions,
) {
  const { dependencies, catalogFile } = options;
  let state: ProjectStorageState = readProjects(catalogFile) ?? {
    projects: [
      {
        projectId: GENERAL_PROJECT_ID,
        name: "General",
        cwd: await projectDirectory(options.defaultCwd ?? process.cwd()),
        createdAt: new Date(),
      },
    ],
    chats: [],
    requests: [],
  };
  if (
    !state.projects.some((project) => project.projectId === GENERAL_PROJECT_ID)
  ) {
    throw new Error("Project catalog is missing General.");
  }
  // Copy IDs are journaled before writing run files. Incomplete creations never become visible.
  for (const request of state.requests.filter((entry) => !entry.result)) {
    await dependencies.runs.removeCopiedRuns(request.targetRootIds);
  }
  state = {
    ...state,
    requests: state.requests.filter((entry) => entry.result),
  };
  writeProjects(catalogFile, state);

  const listeners = new Set<(catalog: ProjectCatalog) => void>();
  const runCleanups = new Map<string, Array<() => void>>();
  let pendingMutation = Promise.resolve();
  let notificationTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPublished = "";
  let disposed = false;

  function commit(next: ProjectStorageState): void {
    writeProjects(catalogFile, next);
    state = next;
    schedulePublish();
  }
  function mutate<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = pendingMutation.then(operation);
    pendingMutation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function getProject(projectId: string): Project {
    const project = state.projects.find(
      (entry) => entry.projectId === projectId,
    );
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }
  function getChat(runId: string): ProjectChat {
    const chat = state.chats.find((entry) => entry.runId === runId);
    if (!chat) {
      throw new Error(`Project chat not found: ${runId}`);
    }
    return chat;
  }
  async function status(chat: ProjectChat): Promise<ProjectChatStatus> {
    const history = await dependencies.runs.getHistory(chat.runId, {
      limit: 1,
    });
    const latest = history.entries.at(-1);
    return {
      latestEntryId: latest?.messageId,
      ...chat,
      attention: await getChatAttention(dependencies, chat.runId),
    };
  }
  async function list(): Promise<ProjectCatalog> {
    const captured = state;
    return {
      projects: captured.projects,
      chats: await Promise.all(captured.chats.map(status)),
    };
  }
  async function publish(): Promise<void> {
    if (disposed || listeners.size === 0) {
      return;
    }
    const catalog = await list();
    if (disposed) {
      return;
    }
    const fingerprint = JSON.stringify(catalog);
    if (fingerprint !== lastPublished) {
      lastPublished = fingerprint;
      for (const listener of listeners) {
        listener(catalog);
      }
    }
  }
  function schedulePublish(): void {
    if (notificationTimer || disposed) {
      return;
    }
    notificationTimer = setTimeout(() => {
      notificationTimer = undefined;
      void publish().catch((error: unknown) =>
        console.error("Could not publish project state", error),
      );
    }, 25);
  }
  async function observeRun(runId: string): Promise<void> {
    if (runCleanups.has(runId)) {
      return;
    }
    const cleanups: Array<() => void> = [];
    runCleanups.set(runId, cleanups);
    try {
      for (const type of [
        "run_snapshot",
        "run_input_requested",
        "run_input_resolved",
        "run_child",
        "run_message_output",
      ] as const) {
        cleanups.push(
          await dependencies.runs.notifications.subscribe(
            type,
            runId,
            schedulePublish,
          ),
        );
      }
      for (const type of [
        "run_question_requested",
        "run_question_resolved",
      ] as const) {
        cleanups.push(
          await dependencies.questions.notifications.subscribe(
            type,
            runId,
            schedulePublish,
          ),
        );
      }
      for (const type of [
        "run_permission_requested",
        "run_permission_resolved",
      ] as const) {
        cleanups.push(
          await dependencies.sandbox.notifications.subscribe(
            type,
            runId,
            schedulePublish,
          ),
        );
      }
    } catch (error) {
      for (const cleanup of cleanups) {
        cleanup();
      }
      runCleanups.delete(runId);
      throw error;
    }
  }
  function replaceChat(chat: ProjectChat): void {
    commit({
      ...state,
      chats: state.chats.map((entry) =>
        entry.runId === chat.runId ? chat : entry,
      ),
    });
  }

  const plugin = createPlugin({
    name: "projects",
    server: { commands: projectCommands, channels: [projectWatchChannel] },
    async cleanup() {
      disposed = true;
      clearTimeout(notificationTimer);
      for (const cleanups of runCleanups.values()) {
        for (const cleanup of cleanups) {
          cleanup();
        }
      }
      listeners.clear();
      await pendingMutation;
    },
  });
  const methods: Omit<ProjectsPlugin, keyof typeof plugin> = {
    list,
    create: (input) =>
      mutate(async () => {
        const argumentsValue = CreateProjectSchema.parse(input);
        const fingerprint = JSON.stringify(argumentsValue);
        const previousRequest = state.requests.find(
          (entry) => entry.requestId === argumentsValue.requestId,
        );
        if (previousRequest) {
          if (previousRequest.fingerprint !== fingerprint) {
            throw new Error(
              "Project request ID was already used with different options.",
            );
          }
          if (previousRequest.result) {
            return previousRequest.result;
          }
          throw new Error(
            "An earlier project creation needs recovery before retrying.",
          );
        }
        const cwd = await projectDirectory(argumentsValue.cwd);
        const source = argumentsValue.sourceProjectId
          ? getProject(argumentsValue.sourceProjectId)
          : undefined;
        if (!source && argumentsValue.mode !== "fresh") {
          throw new Error("Moving or copying chats requires a source project.");
        }
        if (
          source?.projectId === GENERAL_PROJECT_ID &&
          argumentsValue.mode !== "move"
        ) {
          throw new Error(
            "Creating from General moves its current conversations.",
          );
        }
        const selectedIds = new Set(argumentsValue.runIds ?? []);
        const selected =
          source?.projectId === GENERAL_PROJECT_ID
            ? state.chats.filter(
                (chat) =>
                  chat.projectId === GENERAL_PROJECT_ID && !chat.archivedAt,
              )
            : state.chats.filter(
                (chat) =>
                  chat.projectId === source?.projectId &&
                  selectedIds.has(chat.runId),
              );
        if (
          source?.projectId !== GENERAL_PROJECT_ID &&
          selected.length !== selectedIds.size
        ) {
          throw new Error(
            "Selected conversations must belong to the source project.",
          );
        }
        if (argumentsValue.mode === "fresh" && selected.length) {
          throw new Error("Fresh projects do not carry conversations.");
        }
        const project: Project = {
          projectId: crypto.randomUUID(),
          name: argumentsValue.name,
          cwd,
          createdAt: new Date(),
        };
        const runIdMap = Object.fromEntries(
          selected.map((chat) => [
            chat.runId,
            argumentsValue.mode === "copy" ? crypto.randomUUID() : chat.runId,
          ]),
        );
        const targetRootIds =
          argumentsValue.mode === "copy" ? Object.values(runIdMap) : [];
        const request = {
          requestId: argumentsValue.requestId,
          fingerprint,
          targetRootIds,
        };
        // This journal write precedes every copied run publication.
        commit({ ...state, requests: [...state.requests, request] });
        try {
          if (argumentsValue.mode === "copy") {
            for (const chat of selected) {
              await dependencies.runs.copyRun({
                runId: chat.runId,
                targetRunId: runIdMap[chat.runId]!,
                cwd,
                checkpointId: argumentsValue.checkpoints?.[chat.runId],
              });
            }
          }
          const now = new Date();
          const carried = selected.map((chat): ProjectChat => ({
            ...chat,
            runId: runIdMap[chat.runId]!,
            projectId: project.projectId,
            ...(argumentsValue.mode === "copy"
              ? {
                  lastActivityAt: now,
                  archivedAt: undefined,
                  doneAt: undefined,
                }
              : {}),
          }));
          const result = { project, runIdMap };
          commit({
            projects: [...state.projects, project],
            chats: [
              ...state.chats.filter(
                (chat) =>
                  argumentsValue.mode !== "move" || !runIdMap[chat.runId],
              ),
              ...carried,
            ],
            requests: state.requests.map((entry) =>
              entry.requestId === request.requestId
                ? { ...request, result }
                : entry,
            ),
          });
          for (const chat of carried) {
            await observeRun(chat.runId).catch((error: unknown) => {
              console.error(
                "Could not observe committed project conversation",
                error,
              );
            });
          }
          return result;
        } catch (error) {
          // Once the catalog committed, copied runs are visible and must not be removed.
          if (
            !state.requests.some(
              (entry) => entry.requestId === request.requestId && entry.result,
            )
          ) {
            await dependencies.runs.removeCopiedRuns(targetRootIds);
            commit({
              ...state,
              requests: state.requests.filter(
                (entry) => entry.requestId !== request.requestId,
              ),
            });
          }
          throw error;
        }
      }),
    assign: (input) =>
      mutate(async () => {
        const argumentsValue = AssignProjectChatSchema.parse(input);
        getProject(argumentsValue.projectId);
        const snapshot = await dependencies.runs.getRun(argumentsValue.runId);
        if (!snapshot || snapshot.parentRunId) {
          throw new Error(
            "Only an existing root conversation can be assigned to a project.",
          );
        }
        const previous = state.chats.find(
          (chat) => chat.runId === argumentsValue.runId,
        );
        if (previous && previous.projectId !== argumentsValue.projectId) {
          throw new Error(
            "Conversation already belongs to another project; use project creation to move it.",
          );
        }
        const chat: ProjectChat = previous ?? {
          runId: argumentsValue.runId,
          projectId: argumentsValue.projectId,
          title: argumentsValue.title ?? snapshot.strategy?.name ?? "New chat",
          lastActivityAt: new Date(),
        };
        if (!previous) {
          commit({ ...state, chats: [...state.chats, chat] });
        }
        await observeRun(chat.runId);
        return status(chat);
      }),
    activity: (input) =>
      mutate(async () => {
        const argumentsValue = ProjectActivitySchema.parse(input);
        const previous = getChat(argumentsValue.runId);
        const chat = {
          ...previous,
          title: argumentsValue.title ?? previous.title,
          lastActivityAt: new Date(),
        };
        replaceChat(chat);
        return status(chat);
      }),
    archive: (input) =>
      mutate(async () => {
        const argumentsValue = ArchiveProjectChatSchema.parse(input);
        const previous = getChat(argumentsValue.runId);
        const chatStatus = await status(previous);
        if (
          dependencies.runs.getPendingInputs(previous.runId).length > 0 ||
          chatStatus.attention.running ||
          chatStatus.attention.question ||
          chatStatus.attention.permission
        ) {
          throw new Error(
            "A conversation with active work or pending decisions cannot be archived.",
          );
        }
        const chat = {
          ...previous,
          archivedAt: previous.archivedAt ?? new Date(),
          doneAt: argumentsValue.done
            ? (previous.doneAt ?? new Date())
            : previous.doneAt,
        };
        replaceChat(chat);
        return status(chat);
      }),
    restore: (runId) =>
      mutate(async () => {
        const chat = {
          ...getChat(runId),
          archivedAt: undefined,
          doneAt: undefined,
          lastActivityAt: new Date(),
        };
        replaceChat(chat);
        return status(chat);
      }),
    search: async (input) => {
      const argumentsValue = SearchProjectArchiveSchema.parse(input);
      getProject(argumentsValue.projectId);
      const query = argumentsValue.query?.trim().toLocaleLowerCase() ?? "";
      const matches: ProjectChat[] = [];
      for (const chat of state.chats.filter(
        (entry) =>
          entry.projectId === argumentsValue.projectId && entry.archivedAt,
      )) {
        let matched = !query || chat.title.toLocaleLowerCase().includes(query);
        if (!matched) {
          const history = await dependencies.runs.getHistory(chat.runId);
          matched = history.entries.some(
            (entry) =>
              entry.type === "message" &&
              entry.content.some(
                (content) =>
                  content.type === "text" &&
                  content.text.toLocaleLowerCase().includes(query),
              ),
          );
        }
        if (matched) {
          matches.push(chat);
        }
      }
      matches.sort(
        (left, right) =>
          right.lastActivityAt.getTime() - left.lastActivityAt.getTime(),
      );
      const end = argumentsValue.offset + argumentsValue.limit;
      return {
        chats: await Promise.all(
          matches.slice(argumentsValue.offset, end).map(status),
        ),
        total: matches.length,
        ...(end < matches.length ? { nextOffset: end } : {}),
      };
    },
    watch: async (listener) => {
      listeners.add(listener);
      try {
        listener(await list());
      } catch (error) {
        listeners.delete(listener);
        throw error;
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          lastPublished = "";
        }
      };
    },
  };
  for (const chat of state.chats) {
    await observeRun(chat.runId);
  }
  return Object.assign(plugin, methods);
}
