/** Structured payload returned by `restore_file`. */
export interface RestoreFileData {
  /** Always `true` on success. */
  readonly restored: true;
  /** Workspace-relative path where the file was restored. */
  readonly path: string;
  /** Absolute path of the trash archive this was restored from. */
  readonly from: string;
  /** Byte length of the restored content. */
  readonly sizeBytes: number;
}
