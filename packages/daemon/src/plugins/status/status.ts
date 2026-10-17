import { version } from "../../../package.json";
import { createPlugin } from "../../daemon-plugin";
import { getStatusCommand, watchStatusChannel } from "./server";
import type {
  DaemonStatus,
  StatusContext,
  StatusNotifications,
  StatusPlugin,
  CreatedStatusPlugin,
} from "./status.types";

/**
 * Construct public status observation and a private daemon lifecycle controller.
 * @returns {CreatedStatusPlugin} Public status and private lifecycle controller.
 * @example
 * const { plugin, setPhase } = createStatusPlugin();
 * setPhase("running");
 */
export function createStatusPlugin(): CreatedStatusPlugin {
  const context: StatusContext = {
    snapshot: {
      phase: "starting",
      version,
      startedAt: new Date().toISOString(),
    },
  };
  const { plugin, notifications } = createPlugin<
    "status",
    StatusNotifications,
    StatusPlugin,
    StatusContext
  >({
    name: "status",
    notifications: true,
    context,
    async cleanup() {},
    server: { commands: [getStatusCommand], channels: [watchStatusChannel] },
    notificationHooks: {
      onSubscribe(_type, _key, deliver) {
        deliver({ type: "status_updated", status: context.snapshot });
      },
    },
  });
  return {
    plugin: Object.assign(plugin, {
      getStatus(): DaemonStatus {
        return context.snapshot;
      },
    }),
    setPhase(phase: DaemonStatus["phase"]): void {
      context.snapshot = { ...context.snapshot, phase };
      notifications.notify("daemon", {
        type: "status_updated",
        status: context.snapshot,
      });
    },
  };
}
