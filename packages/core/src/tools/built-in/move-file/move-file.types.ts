import type { AuditSink } from "../../io/audit";

export interface MoveFileToolConfig {
  readonly defaultAuditSink?: AuditSink;
}

export interface MoveFileData {
  readonly moved: true;
  readonly fromPath: string;
  readonly toPath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly overwroteTrashedTo?: string;
}
