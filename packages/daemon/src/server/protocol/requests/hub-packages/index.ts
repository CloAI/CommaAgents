import type { HandlerContext } from "../../dispatcher.types";
import type {
  HubInstallMessage,
  HubListMessage,
  HubRemoveMessage,
  HubUpdateMessage,
} from "./hub-packages.schema";

export {
  HubInstallMessage,
  HubListMessage,
  HubRemoveMessage,
  HubUpdateMessage,
} from "./hub-packages.schema";

function replyError(
  context: HandlerContext<"hub_install" | "hub_update" | "hub_remove">,
  requestId: string | undefined,
  error: unknown,
): void {
  context.reply({
    type: "error",
    code: "HUB_ERROR",
    message: error instanceof Error ? error.message : String(error),
    ts: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
  });
}

export async function handleHubList(
  message: HubListMessage,
  context: HandlerContext<"hub_list">,
): Promise<void> {
  try {
    if (!context.hubManager) throw new Error("Hub manager is unavailable");
    const [available, installed] = await Promise.all([
      context.hubManager.listAvailable(),
      context.hubManager.listInstalled(),
    ]);
    context.reply({
      type: "hub_packages",
      operation: "list",
      available: [...available],
      installed: [...installed],
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  } catch (error) {
    context.reply({
      type: "error",
      code: "HUB_ERROR",
      message: error instanceof Error ? error.message : String(error),
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  }
}

export async function handleHubInstall(
  message: HubInstallMessage,
  context: HandlerContext<"hub_install">,
): Promise<void> {
  try {
    if (!context.hubManager) throw new Error("Hub manager is unavailable");
    const installedPackage = await context.hubManager.install(message.name, {
      allowCode: message.allowCode,
    });
    context.reply({
      type: "hub_packages",
      operation: "install",
      installedPackage,
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  } catch (error) {
    replyError(context, message.requestId, error);
  }
}

export async function handleHubUpdate(
  message: HubUpdateMessage,
  context: HandlerContext<"hub_update">,
): Promise<void> {
  try {
    if (!context.hubManager) throw new Error("Hub manager is unavailable");
    const installedPackage = await context.hubManager.update(message.name, {
      allowCode: message.allowCode,
    });
    context.reply({
      type: "hub_packages",
      operation: "update",
      installedPackage,
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  } catch (error) {
    replyError(context, message.requestId, error);
  }
}

export async function handleHubRemove(
  message: HubRemoveMessage,
  context: HandlerContext<"hub_remove">,
): Promise<void> {
  try {
    if (!context.hubManager) throw new Error("Hub manager is unavailable");
    const removed = await context.hubManager.remove(message.name);
    context.reply({
      type: "hub_packages",
      operation: "remove",
      removed,
      ts: new Date().toISOString(),
      ...(message.requestId ? { requestId: message.requestId } : {}),
    });
  } catch (error) {
    replyError(context, message.requestId, error);
  }
}
