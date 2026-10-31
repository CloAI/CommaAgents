import { act } from "react";
import { expect, waitFor } from "storybook/test";
import {
  deliver,
  requests,
} from "../../../../hooks/useCommaAgentsDaemon/test.utils";
import type { CapturedRequest } from "../../../../hooks/useCommaAgentsDaemon/test.utils";
import { MockWebSocket } from "../../../../hooks/useWebSocket/test.utils";
import type { ProviderConfiguration } from "./ProviderConfigurationDialog.types";
import type { DiscoveredProvider } from "../ProvidersSettings.types";
/** Representative provider with a supported API-key verification endpoint. */
export const openAIProvider: DiscoveredProvider = {
  id: "openai",
  name: "OpenAI",
  credentialType: "api",
  authStatus: "none",
  models: [],
  origin: "catalog",
  discovery: {
    status: "catalog_only",
  },
};
/** Empty global credential configuration. */
export const emptyConfiguration: ProviderConfiguration = {
  providerId: "openai",
  authStatus: "none",
  hasSavedCredential: false,
  credentialSource: "none",
  verificationSupported: true,
  customProvider: null,
  customModels: [],
};
/** Install a fresh browser socket fixture for one story.
 * @returns {() => void} Restore the browser environment.
 */
export function mockProviderSocket() {
  const original = globalThis.WebSocket;
  const settings = localStorage.getItem("comma-agents.settings");
  localStorage.removeItem("comma-agents.settings");
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  const environment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    globalThis.WebSocket = original;
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
    if (settings === null) localStorage.removeItem("comma-agents.settings");
    else localStorage.setItem("comma-agents.settings", settings);
  };
}
/** Wait for one explicit command by name.
 * @param {string} command - Expected daemon command.
 * @returns {Promise<CapturedRequest>} Most recent matching request.
 */
export async function providerRequest(
  command: string,
): Promise<CapturedRequest> {
  const socket = MockWebSocket.instances.at(-1)!;
  await waitFor(() =>
    expect(
      requests(socket, "command").filter(
        (request) => request.command === command,
      ).length,
    ).toBeGreaterThan(0),
  );
  return requests(socket, "command")
    .filter((request) => request.command === command)
    .at(-1)!;
}
/** Reply through the real shared context routing.
 * @param {CapturedRequest} request - Request receiving the response.
 * @param {Record<string, unknown>} data - Command result.
 * @returns {Promise<void>} Resolves after rendering updates.
 */
export async function replyProvider(
  request: CapturedRequest,
  data: Record<string, unknown>,
): Promise<void> {
  await act(async () =>
    deliver(MockWebSocket.instances.at(-1)!, request.requestId, {
      type: "response",
      ok: true,
      data,
    }),
  );
}
/** Open the socket and answer the form's initial configuration query.
 * @param {ProviderConfiguration} configuration - Initial secret-free configuration.
 * @returns {Promise<void>} Resolves after configuration is visible.
 */
export async function loadProviderForm(
  configuration: ProviderConfiguration = emptyConfiguration,
): Promise<void> {
  await act(() => MockWebSocket.instances.at(-1)!.open());
  await replyProvider(
    await providerRequest("core.providers.getConfiguration"),
    configuration,
  );
}
