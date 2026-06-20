export interface LaunchTuiOptions {
  /** Strategy name to open in the TUI. */
  readonly strategy?: string;
  /** Initial input message passed through to the TUI. */
  readonly input?: string;
  /** Daemon WebSocket URL passed through to the TUI. */
  readonly daemonUrl?: string;
  /** Enable TUI development mode. @default false */
  readonly dev?: boolean;
  /** Command used to start the daemon in foreground mode. */
  readonly daemonCommand?: ReadonlyArray<string>;
  /** Maximum daemon readiness wait in milliseconds. @default 5000 */
  readonly readinessTimeoutMs?: number;
}
