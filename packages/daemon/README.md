# @comma-agents/daemon

Background execution daemon and WebSocket protocol for CommaAgents.

```bash
pnpm add --global @comma-agents/daemon@next
comma-agents-daemon start
```

Requires Node.js 26 or newer.

## Browser protocol

Import the current daemon wire schemas and operation contracts from the browser-safe protocol entry point:

```ts
import { ServerMessageSchema } from "@comma-agents/daemon/protocol";
import type {
  DaemonCommandMap,
  DaemonChannelMap,
} from "@comma-agents/daemon/protocol";

const commandArguments: DaemonCommandMap["runs.get"]["arguments"] = {
  runId: "example",
};
type RunResult = DaemonCommandMap["runs.get"]["result"];
type RunEvent = DaemonChannelMap["runs"]["message"];

const socket = new WebSocket("ws://127.0.0.1:7422/ws");
socket.addEventListener("message", (event) => {
  const response = ServerMessageSchema.safeParse(JSON.parse(event.data));
  if (response.success) console.log(response.data);
});
```

`ArgumentsSchema` is also exported for validating JSON argument objects before sending requests. Binding-specific argument types come from the command and channel maps.

Command and channel contracts follow the built-in plugins' registered bindings. The main package entry point targets Bun; browser applications should use `/protocol`.

Plugins are constructed with one `createPlugin(configuration)` call. Keep command and channel registrations inline in `configuration.server`; the constructor returns the plugin immediately. Existing explicit generic calls remain supported. When retaining concrete server contracts for inference, let the call infer its configuration and use `satisfies CreateNotifyingPluginOptions<...>` on the configuration object for notification and owner type checking. This preserves the literal binding names and schemas without a separate registration catalog.

## Core provider APIs

The kernel includes a `core` plugin. Subscribe to the `core.providers.list` channel for known providers, their authentication configuration status, and model metadata:

```ts
socket.addEventListener("open", () => {
  socket.send(
    JSON.stringify({
      type: "subscribe",
      requestId: crypto.randomUUID(),
      channel: "core.providers.list",
      arguments: {},
    }),
  );
});
```

Each message is `{ type: "providers.updated", data: { providers, refreshing } }`, sent when the channel opens and again after every change. Models combine models.dev, the provider's own API, and manual entries. The daemon calls provider APIs at startup, after credential and custom-provider changes, and on `core.providers.refresh`, which also re-downloads models.dev; `refreshing` is `true` meanwhile. Credential values are not returned. `configured` means credentials are present, not that the provider has accepted them.

Daemon hosts read the same list with `kernel.plugins.core.providers.snapshot()`. The UI hook infers its message type from kernel registration:

```tsx
const { data, errors, clientError } = useCommaAgentsDaemon(
  { channel: "core.providers.list" },
  {},
);
// data?.data.providers contains the providers.
```

The same namespace exposes `getConfiguration`, `configure`, `verify`, `removeCredential`, `addCustomProvider`, `updateCustomProvider`, `removeCustomProvider`, `addCustomProviderModel`, and `removeCustomProviderModel`. Each has a matching `core.providers.*` command. Core owns the reusable provider settings and credential APIs; these remain available directly from `@comma-agents/core` without a daemon.

Provider settings persist in `.comma/provider-settings.json`, with model objects and optional metadata nested under each provider entry; credentials remain in their existing store. Custom definitions support API-key or unauthenticated endpoints. User-added model IDs are additive: removing one does not hide models from models.dev or the provider's API. Secret-free configuration reads include effective credential source, saved-key availability, custom endpoint fields, and manual model metadata.

`verify` makes one explicit authenticated model-list request for OpenAI, Anthropic, or Gemini, with no generation, retries, polling, or stored verification result. Other providers return `unsupported`; `verified` establishes endpoint access, not credit or generation permissions. An empty or failed provider listing leaves models.dev and manual models.

Removing a custom provider removes its global credential before removing its definition and models. If the settings write then fails, the operation reports `PROVIDER_REMOVAL_PARTIAL`; retry removal. Environment and strategy-scoped credentials remain unchanged.
