// @comma-agents/utils
// Shared generic utilities — not part of the public API.
// This package is internal to the monorepo and not published to npm.

// Abortable
export { createAbortableGenerator, createAbortablePromise } from "./abortable";

// Abortable types
export type { AbortableAsyncGenerator, AbortablePromise } from "./abortable.types";

// Async
export { sleep } from "./async";
// Date
export { isoNow } from "./date";
// Platform
export { isLinux, isSystemd } from "./platform";
// Process
export { isRunning, readPid, removePid, writePid } from "./process";
// String
export { breakLines, capitalize, collapseNewlines, countOccurrences, truncateText } from "./string";
