/** Application-owned daemon process lifetime. */
export interface DaemonRuntime {
  /** Stop the listener, dispose plugins, and release process resources once. */
  stop(): Promise<void>;
}
