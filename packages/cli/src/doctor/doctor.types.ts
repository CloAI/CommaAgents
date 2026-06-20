export type DoctorStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  /** Stable check identifier for JSON output. */
  readonly id: string;
  /** Human-readable check label. */
  readonly label: string;
  /** Result status for this check. */
  readonly status: DoctorStatus;
  /** User-facing details or remediation text. */
  readonly message: string;
}

export interface DoctorResult {
  /** Overall doctor status. */
  readonly status: DoctorStatus;
  /** Individual diagnostic checks. */
  readonly checks: ReadonlyArray<DoctorCheck>;
}

export interface DoctorOptions {
  /** Data directory to validate. @default comma-agents platform data dir */
  readonly dataDir?: string;
  /** PATH value to inspect. @default process.env.PATH */
  readonly pathValue?: string;
}
