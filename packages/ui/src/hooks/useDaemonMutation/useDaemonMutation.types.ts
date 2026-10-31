import type {
  DaemonCommandMap,
  DaemonRequestError,
} from "@comma-agents/daemon/protocol";
import type {
  DaemonClientError,
  DaemonCommandResult,
} from "../useCommaAgentsDaemon";

/** Why a command failed: reported by the daemon or detected locally. */
export type DaemonFailure = DaemonRequestError | DaemonClientError;

/** Settled command: its result, or why it failed. */
export type DaemonOutcome<Data> =
  | { readonly ok: true; readonly data: Data }
  | { readonly ok: false; readonly error: DaemonFailure };

/** State and explicit submission for one inferred daemon command. */
export interface DaemonMutationResult<
  Name extends keyof DaemonCommandMap,
> extends DaemonCommandResult<Name> {
  /** Send an ordinary command once; rejects only with a {@link DaemonFailure} and never replays. */
  readonly mutate: (
    args: DaemonCommandMap[Name]["arguments"],
  ) => Promise<DaemonCommandMap[Name]["result"]>;
  /** Send like `mutate`, but resolve the failure instead of rejecting. */
  readonly attempt: (
    args: DaemonCommandMap[Name]["arguments"],
  ) => Promise<DaemonOutcome<DaemonCommandMap[Name]["result"]>>;
}
