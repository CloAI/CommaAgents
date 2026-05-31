import type { AuditSink } from "../../io/audit.types";

export interface CreateFileToolConfig {
  readonly defaultAuditSink?: AuditSink;
}

export interface CreateFileData {
  readonly created: true;
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly diff: string;
}
