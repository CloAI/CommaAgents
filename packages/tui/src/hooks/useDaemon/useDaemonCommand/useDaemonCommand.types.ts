import type { ClientMessage } from "@comma-agents/daemon";

import type { Simplify } from "../useDaemon.types";

/**
 * Maps each client command type to its payload shape.
 *
 * Auto-derived from the `ClientMessage` discriminated union — stays in
 * sync with daemon protocol changes. The `type` and `requestId` fields
 * are stripped because they are auto-injected by `useDaemonCommand`.
 *
 * @example
 * ```ts
 * DaemonCommandMap["start_strategy"]
 * // → { strategyPath: string; input?: string | undefined }
 *
 * DaemonCommandMap["ping"]
 * // → {}
 *
 * DaemonCommandMap["user_input"]
 * // → { runId: string; agentName: string; text: string }
 * ```
 */
export type DaemonCommandMap = {
  [CommandKind in ClientMessage["type"]]: Simplify<
    Omit<Extract<ClientMessage, { type: CommandKind }>, "type" | "requestId">
  >;
};

/** All valid daemon command names. */
export type DaemonCommandType = keyof DaemonCommandMap;
