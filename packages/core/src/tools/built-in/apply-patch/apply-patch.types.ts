import type { AuditSink } from "../../io/audit";

/** Configuration for `apply_patch`. */
export interface ApplyPatchToolConfig {
  /** Default audit sink used when `ctx.auditSink` is undefined. */
  readonly defaultAuditSink?: AuditSink;
}

/** One hunk inside an `Update File` or `Move File` section. */
export interface PatchHunk {
  /** Optional informational header text after `@@`. */
  readonly header: string;
  /**
   * The hunk body, line by line, with the leading sigil preserved
   * (` `, `-`, `+`, or the trailing `\ No newline at end of file`
   * marker). Newlines have been stripped — each entry is one line.
   */
  readonly lines: ReadonlyArray<string>;
  /** 1-indexed line in the original envelope where `@@` appears. */
  readonly sourceLine: number;
}

/** One file operation in the parsed patch plan. */
export type PatchFileOperation =
  | {
      readonly kind: "add";
      readonly path: string;
      /** Bytes to write, decoded from `+` prefix lines. */
      readonly content: string;
      /** 1-indexed line in the envelope where this section started. */
      readonly sourceLine: number;
    }
  | {
      readonly kind: "update";
      readonly path: string;
      readonly hunks: ReadonlyArray<PatchHunk>;
      readonly sourceLine: number;
    }
  | {
      readonly kind: "delete";
      readonly path: string;
      readonly sourceLine: number;
    }
  | {
      readonly kind: "move";
      readonly fromPath: string;
      readonly toPath: string;
      /** Hunks editing the source content before writing at the destination. */
      readonly hunks: ReadonlyArray<PatchHunk>;
      readonly sourceLine: number;
    };

/** Parsed envelope: the in-memory representation of a patch. */
export interface PatchPlan {
  readonly operations: ReadonlyArray<PatchFileOperation>;
  /** Sum of all hunks across all operations. */
  readonly hunkCount: number;
}

/** Per-file result entry returned in `data.changedFiles`. */
export interface ApplyPatchChangedFile {
  /** Source path of the affected file (workspace-relative). */
  readonly path: string;
  /** Operation applied to this file. */
  readonly operation: "add" | "update" | "delete" | "move";
  /** Destination path (move only). */
  readonly toPath?: string;
  /** Pre-image sha256 (omitted for add). */
  readonly beforeSha256?: string;
  /** Post-image sha256 (omitted for delete). */
  readonly afterSha256?: string;
  /** Unified diff describing the change; empty for pure moves with no edits. */
  readonly diff: string;
  /** Trash path of an overwrite victim, if any (currently unused but reserved). */
  readonly trashedTo?: string;
}

/** Structured payload returned by `apply_patch`. */
export interface ApplyPatchData {
  /** Echoes the `atomic` flag actually used. */
  readonly atomic: boolean;
  /** Total hunks across the whole patch. */
  readonly hunkCount: number;
  /** Per-file outcome, in patch order. */
  readonly changedFiles: ReadonlyArray<ApplyPatchChangedFile>;
}
