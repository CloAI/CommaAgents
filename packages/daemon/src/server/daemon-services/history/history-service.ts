import type { DaemonRunState } from "../../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import { handleListRuns } from "../../protocol/requests/list-runs";
import { handleTrashClear } from "../../protocol/requests/trash-clear";
import { handleTrashList } from "../../protocol/requests/trash-list";
import { handleTrashRestore } from "../../protocol/requests/trash-restore";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createHistoryService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore };
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
