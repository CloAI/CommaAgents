import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { Logger } from "../../logger/logger.types";
import { handleListRuns } from "../../server/protocol/requests/list-runs";
import { handleTrashClear } from "../../server/protocol/requests/trash-clear";
import { handleTrashList } from "../../server/protocol/requests/trash-list";
import { handleTrashRestore } from "../../server/protocol/requests/trash-restore";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createHistoryService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
  logger: Logger,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore, logger };
  return {
    name: "history",
    routes: [
      defineDaemonRoute("list_runs", (message, routeContext) =>
        handleListRuns(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("trash_list", (message, routeContext) =>
        handleTrashList(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("trash_restore", (message, routeContext) =>
        handleTrashRestore(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("trash_clear", (message, routeContext) =>
        handleTrashClear(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
