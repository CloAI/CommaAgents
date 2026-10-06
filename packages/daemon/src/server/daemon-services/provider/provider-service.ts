import type { DaemonRunState } from "../../../daemon-run-state";
import type { DaemonStore } from "../../daemon-store";
import { handleGetAvailableModels } from "../../protocol/requests/get-available-models";
import { handleListProviders } from "../../protocol/requests/list-providers";
import { handleRegisterProvider } from "../../protocol/requests/register-provider";
import { handleSetCredential } from "../../protocol/requests/set-credential";
import { handleUnregisterProvider } from "../../protocol/requests/unregister-provider";
import { defineDaemonRoute } from "../daemon-services";
import type { DaemonService } from "../daemon-services.types";
import { createHandlerContext } from "../daemon-services.utils";

export function createProviderService(
  daemonRunState: DaemonRunState,
  daemonStore: DaemonStore,
): DaemonService {
  const dependencies = { daemonRunState, daemonStore };
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
