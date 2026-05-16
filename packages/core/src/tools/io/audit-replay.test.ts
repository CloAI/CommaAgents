// End-to-end audit-replay test: run a sequence of real tool calls
// against a JSONL audit sink on disk, then reload the entries from the
// file and rebuild SessionFileState. Verifies that the audit log is a
// faithful record from which the file-system view can be reconstructed.

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox } from "../../sandbox/sandbox";
import { createCreateFileTool } from "../built-in/create-file/create-file";
import { createDeleteFileTool } from "../built-in/delete-file";
import { createEditFileTool } from "../built-in/edit-file/edit-file";
import { createMoveFileTool } from "../built-in/move-file";
import { createWriteFileTool } from "../built-in/write-file";
import { makeToolContext } from "../test.utils";
import type { ToolContext } from "../tool.types";
import { createFileAuditSink } from "./audit-sink";
import { sha256OfBuffer } from "./hash";
import { buildSessionFileState } from "./session-file-state";
import { trashWorkspaceDir } from "./trash";

let workspaceRoot: string;

beforeEach(async () => {
  const base = realpathSync(tmpdir());
  workspaceRoot = await mkdtemp(join(base, "audit-replay-"));
});

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true });
  await rm(trashWorkspaceDir(workspaceRoot), { recursive: true, force: true });
});

function makeCtx(
  sessionId: string,
  sink: ReturnType<typeof createFileAuditSink>,
): ToolContext {
  return makeToolContext({
    agentName: "replay-agent",
    sandbox: createSandbox({ cwd: workspaceRoot, jail: true }),
    sessionId,
    auditSink: sink,
  });
}

describe("audit log replay", () => {
  it("reconstructs SessionFileState from JSONL after create/edit/move/delete", async () => {
    const sessionId = "sess-replay-1";
    const sink = createFileAuditSink(workspaceRoot);
    const ctx = makeCtx(sessionId, sink);

    // 1. create a.txt
    const createResult = await createCreateFileTool().execute(
      { path: "a.txt", content: "hello\n" },
      ctx,
    );
    expect(createResult.ok).toBe(true);
    const shaAfterCreate = createResult.data!.sha256;

    // 2. edit a.txt
    const editResult = await createEditFileTool().execute(
      {
        path: "a.txt",
        expectedSha256: shaAfterCreate,
        edits: [{ oldText: "hello", newText: "world" }],
      },
      ctx,
    );
    expect(editResult.ok).toBe(true);
    const shaAfterEdit = editResult.data!.afterSha256;
    expect(shaAfterEdit).toBe(sha256OfBuffer("world\n"));

    // 3. write_file replaces content
    const writeResult = await createWriteFileTool().execute(
      {
        path: "a.txt",
        content: "final\n",
        expectedSha256: shaAfterEdit,
      },
      ctx,
    );
    expect(writeResult.ok).toBe(true);
    const shaAfterWrite = writeResult.data!.afterSha256;

    // 4. move a.txt → b.txt
    const moveResult = await createMoveFileTool().execute(
      { fromPath: "a.txt", toPath: "b.txt", expectedSha256: shaAfterWrite },
      ctx,
    );
    expect(moveResult.ok).toBe(true);

    // 5. create c.txt
    const createCResult = await createCreateFileTool().execute(
      { path: "c.txt", content: "C\n" },
      ctx,
    );
    expect(createCResult.ok).toBe(true);
    const shaC = createCResult.data!.sha256;

    // 6. delete c.txt
    const deleteResult = await createDeleteFileTool().execute(
      { path: "c.txt", expectedSha256: shaC },
      ctx,
    );
    expect(deleteResult.ok).toBe(true);

    // --- Reload the JSONL from disk and rebuild state. ---
    const jsonlPath = join(
      workspaceRoot,
      ".comma",
      "audit",
      `${sessionId}.jsonl`,
    );
    const raw = await readFile(jsonlPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    expect(lines.length).toBe(6); // one per successful mutation

    const entries = lines.map((line) => JSON.parse(line));
    const state = buildSessionFileState(entries);

    // a.txt should be gone (moved away), b.txt should hold final content,
    // c.txt should be marked deleted.
    expect(state.has("a.txt")).toBe(false);
    expect(state.get("b.txt")).toEqual({
      path: "b.txt",
      sha256: shaAfterWrite,
      deleted: false,
      stale: false,
    });
    expect(state.get("c.txt")?.deleted).toBe(true);
    expect(state.get("c.txt")?.sha256).toBe(shaC);
  });
});
