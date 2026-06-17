// Mutation capture — derive `tool_mutation` timeline events from the file
// tools an agent invokes, by reading file state on disk before and after each
// call. The core tools compute diffs internally but only expose a string
// result to hooks, so the harness reconstructs the before/after itself.

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  sha256OfBuffer,
  type Timeline,
  type TimelineEvent,
  type ToolHooks,
  unifiedDiff,
} from "@comma-agents/core";

/** File tools whose calls should produce a `tool_mutation` event. */
const MUTATING_TOOLS = new Set([
  "write_file",
  "create_file",
  "edit_file",
  "delete_file",
  "move_file",
]);

/** On-disk snapshot of a single path. */
interface FileSnapshot {
  readonly exists: boolean;
  readonly content: string;
  readonly sha256?: string;
}

/** Read a file's current state; reports `exists: false` if absent/unreadable. */
async function snapshot(absPath: string): Promise<FileSnapshot> {
  try {
    const buffer = await readFile(absPath);
    return {
      exists: true,
      content: buffer.toString("utf-8"),
      sha256: sha256OfBuffer(buffer),
    };
  } catch {
    return { exists: false, content: "" };
  }
}

async function pathExists(absPath: string): Promise<boolean> {
  return stat(absPath).then(
    () => true,
    () => false,
  );
}

/** Parse a tool's JSON args, returning an empty object on failure. */
function parseArgs(args: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(args);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Build a {@link ToolHooks} pair that records `tool_mutation` events onto the
 * given timeline. `cwd` is the sandbox root used to resolve relative paths;
 * `agentName` tags each event; `emit` is called for every appended event.
 */
export function createMutationCapture(options: {
  readonly cwd: string;
  readonly agentName: string;
  readonly timeline: Timeline;
  readonly emit?: (event: TimelineEvent) => void;
}): ToolHooks {
  const { cwd, agentName, timeline, emit } = options;
  /** Resolved-path → pre-call snapshot, set in beforeToolCall. */
  const before = new Map<string, FileSnapshot>();

  function record(event: TimelineEvent): void {
    timeline.append(event);
    emit?.(event);
  }

  return {
    beforeToolCall: [
      async ({ name, args }): Promise<void> => {
        if (!MUTATING_TOOLS.has(name)) return;
        const parsed = parseArgs(args);

        if (name === "move_file") {
          const from = parsed.fromPath;
          if (typeof from === "string") {
            before.set(resolve(cwd, from), await snapshot(resolve(cwd, from)));
          }
          return;
        }

        const path = parsed.path;
        if (typeof path === "string") {
          before.set(resolve(cwd, path), await snapshot(resolve(cwd, path)));
        }
      },
    ],

    afterToolCall: [
      async ({ name, args }): Promise<void> => {
        if (!MUTATING_TOOLS.has(name)) return;
        const parsed = parseArgs(args);
        const ts = new Date().toISOString();

        if (name === "move_file") {
          const from = parsed.fromPath;
          const to = parsed.toPath;
          if (typeof from !== "string" || typeof to !== "string") return;
          const fromAbs = resolve(cwd, from);
          const toAbs = resolve(cwd, to);
          const fromBefore = before.get(fromAbs) ?? {
            exists: false,
            content: "",
          };
          const toAfter = await snapshot(toAbs);
          const fromGone = !(await pathExists(fromAbs));
          record({
            type: "tool_mutation",
            ts,
            agentName,
            toolName: name,
            operation: "move",
            path: from,
            toPath: to,
            ...(fromBefore.sha256 ? { beforeSha256: fromBefore.sha256 } : {}),
            ...(toAfter.sha256 ? { afterSha256: toAfter.sha256 } : {}),
            diff: unifiedDiff(fromBefore.content, toAfter.content, {
              path: to,
            }),
            success: fromGone && toAfter.exists,
          });
          return;
        }

        const path = parsed.path;
        if (typeof path !== "string") return;
        const abs = resolve(cwd, path);
        const pre = before.get(abs) ?? { exists: false, content: "" };

        if (name === "delete_file") {
          const gone = !(await pathExists(abs));
          record({
            type: "tool_mutation",
            ts,
            agentName,
            toolName: name,
            operation: "delete",
            path,
            ...(pre.sha256 ? { beforeSha256: pre.sha256 } : {}),
            success: gone,
          });
          return;
        }

        // write_file / create_file / edit_file
        const post = await snapshot(abs);
        record({
          type: "tool_mutation",
          ts,
          agentName,
          toolName: name,
          operation: pre.exists ? "update" : "create",
          path,
          ...(pre.sha256 ? { beforeSha256: pre.sha256 } : {}),
          ...(post.sha256 ? { afterSha256: post.sha256 } : {}),
          diff: unifiedDiff(pre.content, post.content, { path }),
          success: post.exists,
        });
      },
    ],
  };
}
