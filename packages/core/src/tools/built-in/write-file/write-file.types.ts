import type { AuditSink } from "../../io/audit";

export interface WriteFileToolConfig {
  readonly defaultAuditSink?: AuditSink;
}

export interface WriteFileData {
  readonly path: string;
  readonly beforeSha256: string;
  readonly afterSha256: string;
  readonly sizeBytes: number;
  readonly diff: string;
}
