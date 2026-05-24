// Set-credential request handler.

import type { ApiCredential, OAuthCredential } from "@comma-agents/core";
import { getGlobalCredentialStore } from "@comma-agents/core";

import type { HandlerContext } from "../../dispatcher.types";
import type { SetCredentialMessage } from "./set-credential.schema";

export { SetCredentialMessage } from "./set-credential.schema";

export async function handleSetCredential(
  message: SetCredentialMessage,
  context: HandlerContext<"set_credential">,
): Promise<void> {
  try {
    const { providerId, credentialType } = message;
    const store = getGlobalCredentialStore();

    if (credentialType === "api") {
      if (!message.apiKey || message.apiKey.length === 0) {
        context.reply({
          type: "error" as const,
          code: "INVALID_MESSAGE",
          message: "API key is required for api-type credentials",
          ts: new Date().toISOString(),
          ...(message.requestId !== undefined
            ? { requestId: message.requestId }
            : {}),
        });
        return;
      }
      const credential: ApiCredential = { type: "api", key: message.apiKey };
      await store.set(providerId, "$global", credential);
    } else if (credentialType === "oauth") {
      if (!message.oauthToken || message.oauthToken.length === 0) {
        context.reply({
          type: "error" as const,
          code: "INVALID_MESSAGE",
          message: "OAuth token is required for oauth-type credentials",
          ts: new Date().toISOString(),
          ...(message.requestId !== undefined
            ? { requestId: message.requestId }
            : {}),
        });
        return;
      }
      const credential: OAuthCredential = {
        type: "oauth",
        accessToken: message.oauthToken,
      };
      await store.set(providerId, "$global", credential);
    } else {
      const credential = {
        type: "custom" as const,
        data: message.customData ?? {},
      };
      await store.set(providerId, "$global", credential);
    }

    context.reply({
      type: "credential_set" as const,
      providerId,
      credentialType,
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  } catch (caughtError) {
    context.logger.error(`set_credential failed: ${caughtError}`);
    context.reply({
      type: "error" as const,
      code: "INTERNAL_ERROR",
      message:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      ts: new Date().toISOString(),
      ...(message.requestId !== undefined
        ? { requestId: message.requestId }
        : {}),
    });
  }
}
