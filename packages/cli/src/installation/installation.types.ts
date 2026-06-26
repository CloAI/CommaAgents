/** How the currently running CommaAgents CLI was installed. */
export type CliInstallation =
  | {
      readonly type: "standalone";
      readonly executablePath: string;
    }
  | {
      readonly type: "package";
      readonly manager: "bun" | "npm" | "pnpm" | "yarn";
    }
  | {
      readonly type: "development";
      readonly entrypoint: string | undefined;
    };

/** Inputs used to identify the current CLI installation method. */
export interface ResolveInstallationOptions {
  readonly standaloneBuild: boolean;
  readonly executablePath: string;
  readonly cliEntrypoint: string | undefined;
}
