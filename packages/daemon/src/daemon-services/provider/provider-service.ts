import type { DaemonRunState } from "../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import type { Logger } from "../../logger/logger.types";
import { handleGetAvailableModels } from "../../server/protocol/requests/get-available-models";
import { handleListProviders } from "../../server/protocol/requests/list-providers";
import { handleRegisterProvider } from "../../server/protocol/requests/register-provider";
import { handleSetCredential } from "../../server/protocol/requests/set-credential";
import { handleUnregisterProvider } from "../../server/protocol/requests/unregister-provider";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createProviderService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
  logger: Logger,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore, logger };
  return {
    name: "providers",
    routes: [
      defineDaemonRoute("get_available_models", (message, routeContext) =>
        handleGetAvailableModels(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("list_providers", (message, routeContext) =>
        handleListProviders(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("register_provider", (message, routeContext) =>
        handleRegisterProvider(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("unregister_provider", (message, routeContext) =>
        handleUnregisterProvider(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
      defineDaemonRoute("set_credential", (message, routeContext) =>
        handleSetCredential(
          message,
          createHandlerContext({ routeContext, ...dependencies }),
        ),
      ),
    ],
  };
}
