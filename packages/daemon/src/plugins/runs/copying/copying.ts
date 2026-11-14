import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { RunEntry, RunsContext } from "../state/state.types";
import { RunOutcomeStatus, RunPhase } from "../state/state.schemas";
import { getRunSnapshot } from "../state/state";
import { runSnapshot } from "../state/state.utils";
import { runDirectory, writeRunDocument } from "../state/storage/storage.utils";
import { CopyCheckpointSchema, CopyManifestSchema } from "./copying.schemas";
import type { CopyCheckpoint, CopyManifest } from "./copying.schemas";
import type {
  CopiedRun,
  CopyRunOptions,
  RunCopyCheckpoint,
} from "./copying.types";
import { remapCopiedRun } from "./copying.utils";

/** Freeze a successful root response and its complete delegated tree before publishing completion.
 * @param {RunsContext} context - Run resources and storage.
 * @param {RunEntry} entry - Successful root execution being finalized.
 * @returns {Promise<void>} Completion after the immutable checkpoint is durable.
 */
export async function saveCopyCheckpoint(
  context: RunsContext,
  entry: RunEntry,
): Promise<void> {
  if (
    entry.parentRunId !== undefined ||
    entry.state.phase !== RunPhase.terminal ||
    entry.state.outcome.status !== RunOutcomeStatus.completed
  ) {
    return;
  }
  const captured: CopyCheckpoint["runs"] = [];
  const reserved: string[] = [];
  const visited = new Set<string>();
  async function capture(runId: string): Promise<void> {
    if (visited.has(runId)) {
      throw new Error(
        "A delegated run appears more than once in the conversation tree",
      );
    }
    visited.add(runId);
    if (runId !== entry.runId) {
      if (context.operations.has(runId)) {
        throw new Error("A delegated conversation is busy while checkpointing");
      }
      context.operations.add(runId);
      reserved.push(runId);
    }
    const snapshot =
      runId === entry.runId
        ? runSnapshot(entry)
        : await getRunSnapshot(context, runId);
    if (!snapshot || snapshot.phase !== RunPhase.terminal) {
      throw new Error(
        "A completed response has an unfinished delegated conversation",
      );
    }
    const history = await context.history.read(runId);
    const conversation = await context.storage.conversation(runId);
    captured.push({
      snapshot,
      history: [...history.entries],
      conversation: [...conversation],
    });
    for (const child of history.entries) {
      if (child.type === "child.run") {
        await capture(child.childRunId);
      }
    }
  }
  try {
    await capture(entry.runId);
    const checkpoint = CopyCheckpointSchema.parse({
      version: 1,
      checkpointId: crypto.randomUUID(),
      rootRunId: entry.runId,
      completedAt: new Date().toISOString(),
      runs: captured,
    });
    const directory = join(
      runDirectory(context.runsDir, entry.runId),
      "checkpoints",
    );
    mkdirSync(directory, { recursive: true });
    writeRunDocument(
      join(directory, `${checkpoint.checkpointId}.json`),
      checkpoint,
    );
    writeRunDocument(join(directory, "latest.json"), {
      checkpointId: checkpoint.checkpointId,
    });
  } finally {
    for (const runId of reserved) {
      context.operations.delete(runId);
    }
  }
}

function readCheckpoint(
  context: RunsContext,
  runId: string,
  checkpointId?: string,
): CopyCheckpoint | undefined {
  const directory = join(runDirectory(context.runsDir, runId), "checkpoints");
  const latestPath = join(directory, "latest.json");
  if (!checkpointId && !existsSync(latestPath)) {
    return undefined;
  }
  const selected =
    checkpointId ??
    (JSON.parse(readFileSync(latestPath, "utf8")) as { checkpointId: string })
      .checkpointId;
  // Identities are encoded rather than accepted as filesystem paths.
  const path = join(directory, `${encodeURIComponent(selected)}.json`);
  if (!existsSync(path)) {
    return undefined;
  }
  const checkpoint = CopyCheckpointSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  if (checkpoint.rootRunId !== runId || checkpoint.checkpointId !== selected) {
    throw new Error("Copy checkpoint identity does not match its document");
  }
  return checkpoint;
}

/** Inspect a copyable whole response without allocating execution resources.
 * @param {RunsContext} context - Run resources and storage.
 * @param {string} runId - Root conversation identity.
 * @returns {Promise<RunCopyCheckpoint | undefined>} Latest stable response, if any.
 */
export async function getCopyCheckpoint(
  context: RunsContext,
  runId: string,
): Promise<RunCopyCheckpoint | undefined> {
  const checkpoint = readCheckpoint(context, runId);
  return checkpoint
    ? {
        checkpointId: checkpoint.checkpointId,
        completedAt: new Date(checkpoint.completedAt),
        runIds: checkpoint.runs.map(({ snapshot }) => snapshot.runId),
      }
    : undefined;
}

/** Copy one immutable response tree, replaying the same target identity safely after restart.
 * @param {RunsContext} context - Run resources and storage.
 * @param {CopyRunOptions} options - Source checkpoint and destination identity and directory.
 * @returns {Promise<CopiedRun>} Newly owned root and delegated identities.
 */
export async function copyRun(
  context: RunsContext,
  {
    runId,
    targetRunId = crypto.randomUUID(),
    cwd,
    checkpointId,
  }: CopyRunOptions,
): Promise<CopiedRun> {
  if (!cwd.trim()) {
    throw new Error("A copied conversation requires a working directory");
  }
  const manifests = join(context.runsDir, ".copies");
  const manifestPath = join(runDirectory(manifests, targetRunId), "copy.json");
  let manifest: CopyManifest | undefined = existsSync(manifestPath)
    ? CopyManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")))
    : undefined;
  if (
    manifest &&
    (manifest.sourceRunId !== runId ||
      manifest.cwd !== cwd ||
      (checkpointId !== undefined && manifest.checkpointId !== checkpointId))
  ) {
    throw new Error("Copy target is already owned by a different request");
  }
  if (manifest?.committed) {
    return { runId: targetRunId, runIds: Object.values(manifest.identities) };
  }
  const checkpoint = readCheckpoint(
    context,
    runId,
    manifest?.checkpointId ?? checkpointId,
  );
  if (!checkpoint) {
    throw new Error(
      "This conversation has no completed response available to copy",
    );
  }
  if (manifest === undefined) {
    const identities = Object.fromEntries(
      checkpoint.runs.map(({ snapshot }) => [
        snapshot.runId,
        snapshot.runId === runId ? targetRunId : crypto.randomUUID(),
      ]),
    );
    for (const destinationId of Object.values(identities)) {
      if (
        existsSync(runDirectory(context.runsDir, destinationId)) ||
        context.runs.has(destinationId)
      ) {
        throw new Error("Copy target already exists");
      }
    }
    manifest = {
      version: 1,
      sourceRunId: runId,
      checkpointId: checkpoint.checkpointId,
      targetRunId,
      cwd,
      committed: false,
      identities,
    };
    mkdirSync(runDirectory(manifests, targetRunId), { recursive: true });
    writeRunDocument(manifestPath, manifest);
  }
  const stagingRoot = runDirectory(
    join(context.runsDir, ".copy-staging"),
    targetRunId,
  );
  rmSync(stagingRoot, { recursive: true, force: true });
  for (const destinationId of Object.values(manifest.identities)) {
    if (context.runs.has(destinationId)) {
      throw new Error(
        "Cannot recover a copied conversation that has execution resources",
      );
    }
    rmSync(runDirectory(context.runsDir, destinationId), {
      recursive: true,
      force: true,
    });
  }
  for (const source of checkpoint.runs) {
    const copied = remapCopiedRun(source, manifest);
    const directory = runDirectory(stagingRoot, copied.snapshot.runId);
    mkdirSync(join(directory, "history"), { recursive: true });
    writeRunDocument(join(directory, "run.json"), copied.snapshot);
    writeFileSync(
      join(directory, "conversation.jsonl"),
      copied.conversation.map((event) => JSON.stringify(event)).join("\n") +
        (copied.conversation.length ? "\n" : ""),
      { flush: true },
    );
    for (const history of copied.history) {
      writeRunDocument(
        join(
          directory,
          "history",
          `${encodeURIComponent(history.messageId)}.json`,
        ),
        history,
      );
    }
    writeFileSync(
      join(directory, "history", "index.jsonl"),
      copied.history
        .map(({ messageId }) => JSON.stringify(messageId))
        .join("\n") + (copied.history.length ? "\n" : ""),
      { flush: true },
    );
  }
  const copiedCheckpoint = CopyCheckpointSchema.parse({
    ...checkpoint,
    checkpointId: crypto.randomUUID(),
    rootRunId: targetRunId,
    runs: checkpoint.runs.map((source) => remapCopiedRun(source, manifest!)),
  });
  const checkpointDirectory = join(
    runDirectory(stagingRoot, targetRunId),
    "checkpoints",
  );
  mkdirSync(checkpointDirectory, { recursive: true });
  writeRunDocument(
    join(checkpointDirectory, `${copiedCheckpoint.checkpointId}.json`),
    copiedCheckpoint,
  );
  writeRunDocument(join(checkpointDirectory, "latest.json"), {
    checkpointId: copiedCheckpoint.checkpointId,
  });
  // Publish descendants first and root last; the project transaction publishes membership afterward.
  const copiedIds = Object.values(manifest.identities);
  for (const destinationId of [
    ...copiedIds.filter((identity) => identity !== targetRunId),
    targetRunId,
  ]) {
    renameSync(
      runDirectory(stagingRoot, destinationId),
      runDirectory(context.runsDir, destinationId),
    );
  }
  writeRunDocument(manifestPath, { ...manifest, committed: true });
  rmSync(stagingRoot, { recursive: true, force: true });
  return { runId: targetRunId, runIds: copiedIds };
}

/** Roll back only copies identified by durable ownership manifests; original runs are refused.
 * @param {RunsContext} context - Run resources and storage.
 * @param {readonly string[]} rootIds - Copied roots reserved by an uncommitted project transaction.
 * @returns {Promise<void>} Completion after owned staged and published files are removed.
 */
export async function removeCopiedRuns(
  context: RunsContext,
  rootIds: readonly string[],
): Promise<void> {
  for (const rootId of rootIds) {
    const directory = runDirectory(join(context.runsDir, ".copies"), rootId);
    const path = join(directory, "copy.json");
    if (!existsSync(path)) {
      if (existsSync(runDirectory(context.runsDir, rootId))) {
        throw new Error(
          "Refusing to remove a conversation without copy ownership",
        );
      }
      continue;
    }
    const manifest = CopyManifestSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );
    if (
      manifest.targetRunId !== rootId ||
      Object.values(manifest.identities).includes(manifest.sourceRunId)
    ) {
      throw new Error("Invalid copy ownership manifest");
    }
    const identities = Object.values(manifest.identities);
    if (identities.some((runId) => context.runs.has(runId))) {
      throw new Error(
        "Cannot roll back copied conversations with execution resources",
      );
    }
    for (const runId of identities) {
      rmSync(runDirectory(context.runsDir, runId), {
        recursive: true,
        force: true,
      });
      context.identities.delete(runId);
    }
    rmSync(runDirectory(join(context.runsDir, ".copy-staging"), rootId), {
      recursive: true,
      force: true,
    });
    rmSync(directory, { recursive: true, force: true });
  }
}
