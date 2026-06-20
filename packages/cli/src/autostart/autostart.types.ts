export type AutostartPlatform = "darwin" | "linux" | "win32";

export type AutostartAction =
  | {
      readonly type: "write-file";
      readonly path: string;
      readonly content: string;
    }
  | { readonly type: "run-command"; readonly command: ReadonlyArray<string> };

export interface AutostartPlan {
  /** Platform the plan targets. */
  readonly platform: NodeJS.Platform;
  /** Whether daemon autostart is supported on this platform. */
  readonly supported: boolean;
  /** User-facing explanation of the selected autostart mechanism. */
  readonly description: string;
  /** Actions required to enable daemon autostart. */
  readonly enableActions: ReadonlyArray<AutostartAction>;
  /** Actions required to disable daemon autostart. */
  readonly disableActions: ReadonlyArray<AutostartAction>;
}

export interface AutostartInstallOptions {
  /** Platform to target. @default process.platform */
  readonly platform?: NodeJS.Platform;
  /** Absolute path to the comma binary. @default current process path */
  readonly commaPath?: string;
  /** Home directory used for generated user-level service paths. */
  readonly homeDir?: string;
  /** XDG config directory used on Linux. */
  readonly xdgConfigHome?: string;
}
