import type { DaemonChannelMap } from "@comma-agents/daemon/protocol";

/** Role definitions the daemon offers, whether or not a model is set. */
export type ModelRoleDefinition =
  DaemonChannelMap["core.modelRoles.watch"]["message"]["data"]["defaults"][number];

/** The daemon's configured roles and how to change them. */
export interface ModelRoles {
  /** Configured model per role name, without the `@` prefix. */
  readonly modelRoles: Readonly<Record<string, string>>;
  /** Roles every daemon offers, with what each is for. */
  readonly defaults: readonly ModelRoleDefinition[];
  /** Whether the first read is pending. */
  readonly isLoading: boolean;
  /** Why reading or saving failed. */
  readonly error: string | undefined;
  /** Merge the given roles into the daemon's configuration; resolves whether it saved. */
  readonly save: (roles: Readonly<Record<string, string>>) => Promise<boolean>;
}
