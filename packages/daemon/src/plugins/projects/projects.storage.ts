import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SavedProjectsSchema } from "./projects.schemas";
import type {
  Project,
  ProjectChat,
  CreateProjectResult,
} from "./projects.types";

/** A durable pending copy is rolled back if publication did not commit. */
export interface ProjectRequest {
  readonly requestId: string;
  readonly fingerprint: string;
  readonly targetRootIds: readonly string[];
  readonly result?: CreateProjectResult;
}
/** Whole catalog commits atomically with creation receipts. */
export interface ProjectStorageState {
  readonly projects: readonly Project[];
  readonly chats: readonly ProjectChat[];
  readonly requests: readonly ProjectRequest[];
}
/**
 * Read persistent dates into native objects, rejecting corrupted catalogs.
 * @param {string} file - Catalog document path.
 * @returns {ProjectStorageState | undefined} Catalog, or undefined before first initialization.
 */
export function readProjects(file: string): ProjectStorageState | undefined {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const saved = SavedProjectsSchema.parse(JSON.parse(text));
  const projectFrom = (project: (typeof saved.projects)[number]): Project => ({
    ...project,
    createdAt: new Date(project.createdAt),
  });
  return {
    projects: saved.projects.map(projectFrom),
    chats: saved.chats.map((chat) => ({
      ...chat,
      lastActivityAt: new Date(chat.lastActivityAt),
      doneAt: chat.doneAt ? new Date(chat.doneAt) : undefined,
      archivedAt: chat.archivedAt ? new Date(chat.archivedAt) : undefined,
    })),
    requests: saved.requests.map((request) => ({
      ...request,
      result: request.result
        ? {
            ...request.result,
            project: projectFrom(request.result.project),
          }
        : undefined,
    })),
  };
}
/**
 * Atomically publish the catalog and recovery journal in one document.
 * @param {string} file - Catalog document path.
 * @param {ProjectStorageState} state - Catalog and creation receipts to commit together.
 * @returns {void} Completes after the document is published.
 */
export function writeProjects(file: string, state: ProjectStorageState): void {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flush: true });
  renameSync(temporary, file);
}
