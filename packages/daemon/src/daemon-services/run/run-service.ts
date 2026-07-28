import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { Logger } from "../../logger/logger.types";
import { handleContinueRun } from "../../server/protocol/requests/continue-run";
import { handlePermissionDecision } from "../../server/protocol/requests/permission-decision";
import { handlePrepareRun } from "../../server/protocol/requests/prepare-run";
import { handleQuestionResponse } from "../../server/protocol/requests/question-response";
import { handleStartRun } from "../../server/protocol/requests/start-run";
import { handleSteerRun } from "../../server/protocol/requests/steer-run";
import { handleStopRun } from "../../server/protocol/requests/stop-run";
import { handleUpdatePolicy } from "../../server/protocol/requests/update-policy";
import { handleUserInput } from "../../server/protocol/requests/user-input";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

interface CreateRunServiceOptions {
  readonly daemonRunState: DaemonRunState;
  readonly daemonStore: DaemonStore;
  readonly logger: Logger;
}

export function createRunService({
  daemonRunState,
  daemonStore,
  logger,
}: CreateRunServiceOptions): DaemonService {
  const dependencies = { daemonRunState, daemonStore, logger };
  return {
    name: "runs",
    routes: [
      defineDaemonRoute("prepare_run", (message, routeContext) =>
        handlePrepareRun(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("start_run", (message, routeContext) =>
        handleStartRun(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("continue_run", (message, routeContext) =>
        handleContinueRun(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("stop_run", (message, routeContext) =>
        handleStopRun(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("user_input", (message, routeContext) =>
        handleUserInput(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("permission_decision", (message, routeContext) =>
        handlePermissionDecision(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("question_response", (message, routeContext) =>
        handleQuestionResponse(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("update_policy", (message, routeContext) =>
        handleUpdatePolicy(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("steer_run", (message, routeContext) =>
        handleSteerRun(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
